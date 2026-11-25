/**
 * 公開スタンプ帳スナップショットを読む手順（R2 と DB の呼び方）。外の世界（R2・Supabase）は引数で受け取る。
 * 本番の配線は src/lib/user-snapshot.ts。ここはテスト（tests/user-snapshot-core.test.ts）から偽物を渡して確かめる。
 */
import {
  type UserSnapshot,
  normalizeSnapshotUserId,
  parseUserSnapshot,
  snapshotFromDb,
  userSnapshotKey,
} from './user-snapshot-format.ts';

export type SnapshotStore = {
  /** 無ければ null。読めない（時間切れ・障害）は例外 */
  get(key: string): Promise<{ body: string; etag: string | null } | null>;
  /** 条件つきで置く。条件が合わなければ false。障害は例外 */
  putIf(key: string, body: string, condition: { ifMatch: string } | { ifNoneMatch: '*' }): Promise<boolean>;
};

export type SnapshotDeps = {
  /** null なら R2 を使わない（切り戻し・R2 以外の保存先） */
  store: SnapshotStore | null;
  /** 今の版。公開ID が無ければ null、読めなければ undefined（例外にしない） */
  rev(publicUserId: string): Promise<string | null | undefined>;
  /** get_public_user_snapshot の生の戻り値。失敗は例外 */
  full(publicUserId: string): Promise<unknown>;
  warn?(message: string, error?: unknown): void;
  now?(): number;
};

type ReadResult = { ok: boolean; exists: boolean; etag: string | null; snapshot: UserSnapshot | null };

async function readObject(deps: SnapshotDeps, store: SnapshotStore, id: string): Promise<ReadResult> {
  try {
    const object = await store.get(userSnapshotKey(id));
    if (!object) return { ok: true, exists: false, etag: null, snapshot: null };
    // 古い・別の版の形・壊れたものは null（＝作り直す）
    return { ok: true, exists: true, etag: object.etag, snapshot: parseUserSnapshot(object.body, id, deps.now?.()) };
  } catch (error) {
    deps.warn?.('[user-snapshot] read failed; reading from the DB:', error);
    return { ok: false, exists: false, etag: null, snapshot: null };
  }
}

/**
 * 読んだときの状態が変わっていなければ置く（ETag が同じ / 無かったときだけ）。
 * ほかの表示が先に置いていたら置かない（どちらが新しいかは次の表示が版で判定する）。失敗しても表示は続ける。
 */
async function putIfUnchanged(deps: SnapshotDeps, store: SnapshotStore, read: ReadResult, snapshot: UserSnapshot): Promise<void> {
  if (!read.ok) return; // 読めなかった（そこにある版が分からない）
  if (read.exists && !read.etag) return;
  try {
    await store.putIf(
      userSnapshotKey(snapshot.publicUserId),
      JSON.stringify(snapshot),
      read.exists ? { ifMatch: read.etag as string } : { ifNoneMatch: '*' },
    );
  } catch (error) {
    deps.warn?.('[user-snapshot] write failed:', error);
  }
}

/**
 * 公開スタンプ帳のデータ。利用者がいなければ null。
 * - R2 の JSON と今の版を並行して読み、版が同じなら JSON（Supabase 1本）
 * - 公開ID が無ければ null（Supabase 1本）
 * - 版が違う・JSON が無い・R2 が読めない・版が読めない → DB から1本で作る（版が読めないときは JSON を使わない）
 * - 置く版はデータと同じ時点で読んだもの（先に読んだ版ではない）
 */
export async function loadSnapshotWith(deps: SnapshotDeps, publicUserId: string): Promise<UserSnapshot | null> {
  // 公開ID は UUID。それ以外は DB に聞くまでもなく利用者がいない
  const id = normalizeSnapshotUserId(publicUserId);
  if (!id) return null;

  const store = deps.store;
  if (!store) return snapshotFromDb(await deps.full(id), id, deps.now?.());

  const [read, rev] = await Promise.all([readObject(deps, store, id), deps.rev(id)]);
  if (rev === null) return null; // 404。1本で終わる
  if (rev !== undefined && read.snapshot && read.snapshot.rev === rev) return read.snapshot;

  const snapshot = snapshotFromDb(await deps.full(id), id, deps.now?.());
  if (snapshot) await putIfUnchanged(deps, store, read, snapshot);
  return snapshot;
}
