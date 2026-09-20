import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerReferralStore, REFERRAL_TIMEOUT_MS } from '../src/lib/analytics/tracker-referral.ts';
import { pokefutaEvents, trackEvent } from '../src/lib/analytics/gtag.ts';
import { PREFECTURE_SLUGS } from '../src/lib/prefectureSlug.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('47県を許可し、図鑑由来でないpref・未知値は県として送らない', () => {
  for (const slug of Object.values(PREFECTURE_SLUGS)) {
    const read = createTrackerReferralStore(memoryStorage());
    assert.deepEqual(read(`?pref=${slug}`), {});
    assert.deepEqual(read(`?from=data&pref=${slug}`), {
      source_app: 'tracker', referral_prefecture: slug,
    });
  }
  for (const slug of ['', 'unknown', '東京都', '<script>', 'toString']) {
    const read = createTrackerReferralStore(memoryStorage());
    assert.deepEqual(read(`?from=data&pref=${encodeURIComponent(slug)}`), { source_app: 'tracker' });
  }
});

test('テーマページからの流入は referral_tag として送る', () => {
  const read = createTrackerReferralStore(memoryStorage());
  assert.deepEqual(read('?from=data&pref=hokkaido&tag=roadside'), {
    source_app: 'tracker', referral_prefecture: 'hokkaido', referral_tag: 'roadside',
  });
});

test('テーマ単体（県なし）の流入も拾う', () => {
  // /tags/<slug>/ のリンクは県を持たないことがある
  const read = createTrackerReferralStore(memoryStorage());
  assert.deepEqual(read('?from=data&tag=world_heritage'), {
    source_app: 'tracker', referral_tag: 'world_heritage',
  });
});

test('テーマは形だけ見る。一覧を持つのは図鑑側なので、未知のテーマも通す', () => {
  // テーマが増えるたびに写真館をデプロイし直さないための判断。
  // ただし slug の形から外れた値は送らない。
  const read = createTrackerReferralStore(memoryStorage());
  assert.equal(read('?from=data&tag=future_theme').referral_tag, 'future_theme');
  for (const tag of ['', '道の駅', '<script>', 'A'.repeat(33), '_leading', 'toString']) {
    const fresh = createTrackerReferralStore(memoryStorage());
    assert.equal(
      fresh(`?from=data&tag=${encodeURIComponent(tag)}`).referral_tag,
      undefined,
      `${tag} を通してはいけない`
    );
  }
});

test('新しい図鑑流入にテーマが無ければ、古いテーマは消える', () => {
  // 県と同じ規則。古い帰属を引きずらない
  const storage = memoryStorage();
  const read = createTrackerReferralStore(storage);
  assert.equal(read('?from=data&pref=mie&tag=roadside').referral_tag, 'roadside');
  assert.equal(read('?from=data&pref=mie').referral_tag, undefined);
});

test('保存値のテーマが壊れていれば、その保存値ごと捨てる（県も引き継がない）', () => {
  const storage = memoryStorage();
  storage.setItem(
    'pokefuta:tracker-referral:v1',
    JSON.stringify({ prefecture: 'kagawa', tag: '<script>', lastActivityAt: Date.now() })
  );
  const read = createTrackerReferralStore(storage);
  assert.deepEqual(read(''), {});
});

test('画面遷移と認証後の再読み込みでも保持し、新しい図鑑流入で置き換える', () => {
  const storage = memoryStorage();
  const read = createTrackerReferralStore(storage);
  const expected = { source_app: 'tracker', referral_prefecture: 'kagawa' };
  assert.deepEqual(read('?from=data&pref=kagawa'), expected);
  assert.deepEqual(read(''), expected);
  assert.deepEqual(createTrackerReferralStore(storage)('?code=secret'), expected);
  assert.deepEqual(read('?from=data&pref=mie'), { source_app: 'tracker', referral_prefecture: 'mie' });
  assert.deepEqual(read('?from=data'), { source_app: 'tracker' });
  assert.deepEqual(read('?from=data&pref=invalid'), { source_app: 'tracker' });
});

test('30分無操作で失効し、同じURLに残ったprefから復活しない', () => {
  let time = 100;
  const storage = memoryStorage();
  const read = createTrackerReferralStore(storage, () => time);
  read('?from=data&pref=kagawa');
  time += REFERRAL_TIMEOUT_MS - 1;
  assert.equal(read('?from=data&pref=kagawa').referral_prefecture, 'kagawa');
  time += REFERRAL_TIMEOUT_MS;
  assert.deepEqual(read('?from=data&pref=kagawa'), {});
  assert.deepEqual(createTrackerReferralStore(storage, () => time)(''), {});
});

test('破損した保存値やstorage拒否で例外を出さない', () => {
  for (const saved of ['{broken', 'null', '{"prefecture":"evil","lastActivityAt":100}']) {
    const read = createTrackerReferralStore({ getItem: () => saved, setItem() {}, removeItem() {} });
    assert.deepEqual(read(''), {});
  }
  const fail = () => { throw new Error('blocked'); };
  const read = createTrackerReferralStore({ getItem: fail, setItem: fail, removeItem: fail });
  assert.equal(read('?from=data&pref=mie').referral_prefecture, 'mie');
  assert.equal(read('').referral_prefecture, 'mie');
});

test('両投稿フローと訪問登録に流入県が付き、投稿先の県を上書きしない', () => {
  const originals = ['window', 'document', 'navigator'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const sent: Array<{ name: string; params: Record<string, unknown> }> = [];
  const location = { hostname: 'pokefuta.com', pathname: '/upload', search: '?from=data&pref=kagawa' };
  const stub = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { value, configurable: true });
  stub('window', { location, sessionStorage: memoryStorage(), gtag: (type: string, name: string, params: Record<string, unknown>) => {
    if (type === 'event') sent.push({ name, params });
  } });
  stub('document', { title: 'test' });
  stub('navigator', { language: 'ja-JP' });
  try {
    for (const kind of ['character', 'design'] as const) {
      pokefutaEvents.submissionStart({ submission_kind: kind });
      location.search = '';
      pokefutaEvents.photoUploadComplete({ submission_kind: kind, prefecture: '東京都' });
    }
    trackEvent('p_visit_register', { prefecture: '東京都' });
    assert.equal(sent.length, 5);
    for (const event of sent) {
      assert.equal(event.params.referral_prefecture, 'kagawa');
      assert.equal(event.params.source_app, 'tracker');
      if (event.name !== 'p_submission_start') assert.equal(event.params.prefecture, '東京都');
    }
    location.hostname = 'localhost';
    trackEvent('p_visit_register');
    assert.equal(sent.length, 5);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
