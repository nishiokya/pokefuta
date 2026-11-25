import test from 'node:test';
import assert from 'node:assert/strict';
import { type SnapshotStore, loadSnapshotWith } from '../src/lib/user-snapshot-core.ts';
import { USER_SNAPSHOT_MAX_AGE_MS, userSnapshotKey } from '../src/lib/user-snapshot-format.ts';

// 公開スタンプ帳スナップショットを読む手順を、偽の R2・DB で確かめる。
// 数えるもの: Supabase の呼び出し（rev / full）と R2 の読み書き。

const ID = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-25T12:00:00Z');

const dbRow = (rev: string, over: Record<string, unknown> = {}) => ({
  rev,
  profile: { display_name: 'テスト', pokemon_go_friend_code: '111122223333' },
  avatarPhotoId: null,
  cards: [{ id: 'v1', comment: '公開のコメント' }],
  progressRows: [],
  stats: { totalVisits: 1, prefectureCount: 1 },
  counts: { designManhole: 0, plush: 0, snow: 0 },
  ...over,
});

type World = {
  dbRev: string | null; // null = 公開ID が無い
  dbData: () => unknown;
  revFails?: boolean;
  fullFails?: boolean;
  r2: Map<string, { body: string; etag: string }>;
  r2ReadFails?: boolean;
  r2WriteFails?: boolean;
  calls: { rev: number; full: number; r2Get: number; r2Put: number };
};

function world(over: Partial<World> = {}): World {
  const w: World = {
    dbRev: '1.0.0',
    dbData: () => (w.dbRev === null ? null : dbRow(w.dbRev)),
    r2: new Map(),
    calls: { rev: 0, full: 0, r2Get: 0, r2Put: 0 },
    ...over,
  };
  return w;
}

let etagSeq = 0;
function store(w: World): SnapshotStore {
  return {
    async get(key) {
      w.calls.r2Get += 1;
      if (w.r2ReadFails) throw new Error('R2 read timed out');
      return w.r2.get(key) ?? null;
    },
    async putIf(key, body, condition) {
      w.calls.r2Put += 1;
      if (w.r2WriteFails) throw new Error('R2 write failed');
      const current = w.r2.get(key);
      if ('ifMatch' in condition ? current?.etag !== condition.ifMatch : current !== undefined) return false;
      w.r2.set(key, { body, etag: `e${(etagSeq += 1)}` });
      return true;
    },
  };
}

function load(w: World, opts: { r2?: boolean; now?: number } = {}) {
  return loadSnapshotWith(
    {
      store: opts.r2 === false ? null : store(w),
      async rev() {
        w.calls.rev += 1;
        if (w.revFails) return undefined;
        return w.dbRev;
      },
      async full() {
        w.calls.full += 1;
        if (w.fullFails) throw new Error('DB down');
        return w.dbData();
      },
      now: () => opts.now ?? NOW,
    },
    ID,
  );
}

const supabaseCalls = (w: World) => w.calls.rev + w.calls.full;

test('初回（JSON なし）: Supabase 2本（版＋全体）で作って R2 に置く。2回目は1本（版だけ）', async () => {
  const w = world();
  const first = await load(w);
  assert.equal(first?.rev, '1.0.0');
  assert.equal(supabaseCalls(w), 2);
  assert.equal(w.calls.r2Put, 1);
  assert.ok(w.r2.has(userSnapshotKey(ID)));

  const before = supabaseCalls(w);
  const second = await load(w);
  assert.deepEqual(second, first);
  assert.equal(supabaseCalls(w) - before, 1, 'キャッシュヒットは版の1本だけ');
  assert.equal(w.calls.r2Put, 1, 'ヒットでは書かない');
});

test('公開ID が無い（404）: Supabase 1本で終わり、R2 に書かない', async () => {
  const w = world({ dbRev: null });
  assert.equal(await load(w), null);
  assert.equal(supabaseCalls(w), 1);
  assert.equal(w.calls.r2Put, 0);
});

test('UUID でない ID: Supabase も R2 も呼ばない', async () => {
  const w = world();
  assert.equal(await loadSnapshotWith({ store: store(w), rev: async () => { w.calls.rev += 1; return '1.0.0'; }, full: async () => { w.calls.full += 1; return null; } }, '../x'), null);
  assert.equal(supabaseCalls(w) + w.calls.r2Get, 0);
});

test('公開取り消し（版が変わる）: 古い JSON は使わず、次の表示で新しい内容になる', async () => {
  const w = world();
  await load(w);
  // 運用 SQL で非公開化・フレンド募集 OFF → DB の版が上がる
  w.dbRev = '2.0.0';
  w.dbData = () => dbRow('2.0.0', { cards: [], profile: { display_name: 'テスト', pokemon_go_friend_code: null } });
  const after = await load(w);
  assert.equal(after?.rev, '2.0.0');
  assert.equal(after?.cards.length, 0);
  assert.equal(after?.profile.pokemon_go_friend_code, null);
  assert.ok(!w.r2.get(userSnapshotKey(ID))!.body.includes('公開のコメント'), 'R2 も新しい内容に置き換わる');
});

test('置く版はデータと同じ時点のもの: 先に読んだ版より新しいデータが返っても、その版で置く', async () => {
  const w = world({ dbRev: '1.0.0' });
  // 版を読んだあと、全体を読むまでに変更がコミットされた
  w.dbData = () => dbRow('1.0.1');
  const got = await load(w);
  assert.equal(got?.rev, '1.0.1');
  assert.equal(JSON.parse(w.r2.get(userSnapshotKey(ID))!.body).rev, '1.0.1');
  // 次の表示: DB の版は 1.0.1 → ヒット
  w.dbRev = '1.0.1';
  const before = w.calls.full;
  await load(w);
  assert.equal(w.calls.full, before);
});

test('遅れて置かれた古い JSON（版が古い）は使わない', async () => {
  const w = world({ dbRev: '5.0.0' });
  w.r2.set(userSnapshotKey(ID), { etag: 'old', body: JSON.stringify({ v: 2, generatedAt: new Date(NOW).toISOString(), publicUserId: ID, ...dbRow('4.0.0') }) });
  const got = await load(w);
  assert.equal(got?.rev, '5.0.0');
  assert.equal(w.calls.full, 1);
});

test('版が読めない（Supabase の障害・時間切れ）: JSON は使わず DB から作る', async () => {
  const w = world();
  await load(w);
  w.revFails = true;
  const before = w.calls.full;
  const got = await load(w);
  assert.equal(got?.rev, '1.0.0');
  assert.equal(w.calls.full - before, 1, '鮮度を確かめられない JSON は使わない');
});

test('R2 の読み出しが失敗・時間切れ: DB から作って表示し、R2 には書かない（そこにある版が分からない）', async () => {
  const w = world({ r2ReadFails: true });
  const got = await load(w);
  assert.equal(got?.rev, '1.0.0');
  assert.equal(supabaseCalls(w), 2);
  assert.equal(w.calls.r2Put, 0);
});

test('R2 の書き戻しが失敗: 表示は続ける（例外にしない）', async () => {
  const w = world({ r2WriteFails: true });
  const got = await load(w);
  assert.equal(got?.rev, '1.0.0');
  assert.equal(w.calls.r2Put, 1);
});

test('ほかの表示が先に置いていたら上書きしない（条件つき PUT）', async () => {
  const w = world();
  const key = userSnapshotKey(ID);
  // 読んだあとにほかの表示が置いた
  const s = store(w);
  const racing: SnapshotStore = {
    get: s.get,
    async putIf(k, body, condition) {
      w.r2.set(k, { body: 'other', etag: 'other' });
      return s.putIf(k, body, condition);
    },
  };
  await loadSnapshotWith({ store: racing, rev: async () => '1.0.0', full: async () => dbRow('1.0.0'), now: () => NOW }, ID);
  assert.equal(w.r2.get(key)!.body, 'other');
});

test('DB の全体が失敗: 例外（ページは今までどおり失敗にする）', async () => {
  const w = world({ fullFails: true });
  await assert.rejects(load(w));
});

test('寿命（カタログの反映）を過ぎた JSON は版が同じでも作り直す', async () => {
  const w = world();
  await load(w);
  const before = w.calls.full;
  await load(w, { now: NOW + USER_SNAPSHOT_MAX_AGE_MS + 1 });
  assert.equal(w.calls.full - before, 1);
});

test('切り戻し（R2 なし）: 毎回 Supabase 1本（全体）、R2 に触れない', async () => {
  const w = world();
  await load(w, { r2: false });
  await load(w, { r2: false });
  assert.equal(w.calls.full, 2);
  assert.equal(w.calls.rev, 0);
  assert.equal(w.calls.r2Get + w.calls.r2Put, 0);
});
