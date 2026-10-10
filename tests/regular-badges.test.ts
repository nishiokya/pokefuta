import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REGULAR_BADGE_LABEL,
  STATIC_REGULARS_URL,
  fetchRegularBadges,
  parseRegularBadges,
} from '../src/lib/regular-badges';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const snapshot = {
  success: true,
  generated_at: '2026-10-06T20:30:00+00:00',
  users: { 'pub-a': 'crown', 'pub-b': 'regular', 'pub-d': 'rookie' },
};

test('判定を公開ID → 段階の Map にする', () => {
  const badges = parseRegularBadges(snapshot);
  assert.equal(badges.get('pub-a'), 'crown');
  assert.equal(badges.get('pub-b'), 'regular');
  assert.equal(badges.get('pub-d'), 'rookie');
  assert.equal(badges.get('pub-c'), undefined);
});

test('知らない段階の値は捨てる', () => {
  assert.equal(parseRegularBadges({ ...snapshot, users: { 'pub-a': 'gold', 'pub-b': 1, 'pub-c': 'toString' } }).size, 0);
});

test('壊れた応答ではバッジを出さない', () => {
  for (const body of [null, 'x', { success: false, users: { a: 'crown' } }, { success: true }]) {
    assert.equal(parseRegularBadges(body).size, 0);
  }
});

test('data.pokefuta.com を直接読み、/api を通らない', async () => {
  const urls: string[] = [];
  const badges = await fetchRegularBadges(async (url) => {
    urls.push(url);
    return ok(snapshot);
  });
  assert.deepEqual(urls, [STATIC_REGULARS_URL]);
  assert.ok(STATIC_REGULARS_URL.endsWith('/api/regulars.json'));
  assert.ok(!STATIC_REGULARS_URL.startsWith('/'));
  assert.equal(badges.size, 3);
});

test('取れなかったら空にする（飾りなので画面は壊さない）', async () => {
  assert.equal((await fetchRegularBadges(async () => new Response('', { status: 404 }))).size, 0);
  assert.equal((await fetchRegularBadges(async () => { throw new Error('offline'); })).size, 0);
});

test('文言に判定の条件を入れない', () => {
  for (const label of Object.values(REGULAR_BADGE_LABEL)) {
    assert.doesNotMatch(label, /[0-9０-９]|週|投稿/);
  }
});
