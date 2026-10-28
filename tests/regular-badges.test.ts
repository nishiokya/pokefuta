import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGEND_DESCRIPTION,
  REGULAR_BADGE_ICON,
  REGULAR_TIERS_ASCENDING,
  REGULAR_TIER_MIN_MANHOLES,
  REGULAR_BADGE_NAME,
  REGULAR_BADGE_LABEL,
  STATIC_REGULARS_URL,
  fetchRegularBadges,
  fetchRegularSnapshot,
  parseRegularLegends,
  parseRegularBadges,
  regularTierDescription,
  regularTierForCount,
} from '../src/lib/regular-badges';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const snapshot = {
  success: true,
  generated_at: '2026-10-06T20:30:00+00:00',
  users: { 'pub-a': 'crown', 'pub-b': 'regular', 'pub-d': 'rookie', 'pub-e': 'legend', 'pub-f': 'ranger' },
};

test('判定を公開ID → 段階の Map にする', () => {
  const badges = parseRegularBadges(snapshot);
  assert.equal(badges.get('pub-a'), 'crown');
  assert.equal(badges.get('pub-b'), 'regular');
  assert.equal(badges.get('pub-d'), 'rookie');
  assert.equal(badges.get('pub-e'), 'legend');
  assert.equal(badges.get('pub-f'), 'ranger');
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
  assert.equal(badges.size, 5);
});

test('取れなかったら空にする（飾りなので画面は壊さない）', async () => {
  assert.equal((await fetchRegularBadges(async () => new Response('', { status: 404 }))).size, 0);
  assert.equal((await fetchRegularBadges(async () => { throw new Error('offline'); })).size, 0);
});

test('ラベルには枚数を入れない（条件は説明と /badges に書く）', () => {
  for (const label of Object.values(REGULAR_BADGE_LABEL)) {
    assert.doesNotMatch(label, /[0-9０-９]/);
  }
});

test('5段階の線を公開し、LEGEND は150枚', () => {
  assert.deepEqual(REGULAR_TIERS_ASCENDING, ['rookie', 'regular', 'ranger', 'crown', 'legend']);
  assert.deepEqual(
    REGULAR_TIERS_ASCENDING.map((tier) => REGULAR_TIER_MIN_MANHOLES[tier]),
    [1, 10, 50, 100, 150],
  );
  assert.match(LEGEND_DESCRIPTION, /150枚以上/);
  assert.equal(regularTierDescription('ranger'), 'ポケふたを50枚以上訪問した人');
});

test('枚数から今の段階と次の段階を出す', () => {
  assert.deepEqual(regularTierForCount(0), { current: null, next: 'rookie' });
  assert.deepEqual(regularTierForCount(1), { current: 'rookie', next: 'regular' });
  assert.deepEqual(regularTierForCount(49), { current: 'regular', next: 'ranger' });
  assert.deepEqual(regularTierForCount(50), { current: 'ranger', next: 'crown' });
  assert.deepEqual(regularTierForCount(150), { current: 'legend', next: null });
});

test('どの段階にもアイコンと名前があり、名前に条件を入れない', () => {
  for (const tier of Object.keys(REGULAR_BADGE_LABEL) as Array<keyof typeof REGULAR_BADGE_LABEL>) {
    assert.ok(REGULAR_BADGE_ICON[tier]);
    assert.ok(REGULAR_BADGE_LABEL[tier].includes(REGULAR_BADGE_NAME[tier]));
    assert.doesNotMatch(REGULAR_BADGE_NAME[tier], /[0-9０-９]/);
  }
});

test('LEGEND の公開ID と名前を読む。壊れた項目は捨て、無ければ空', async () => {
  const body = {
    ...snapshot,
    legends: [{ id: 'pub-e', name: 'あんず' }, { id: 'pub-f', name: 'いちご', photo_id: 'ph-1' }, { id: '', name: 'x' }, { id: 'pub-x' }, 'bad'],
  };
  assert.deepEqual(parseRegularLegends(body), [{ id: 'pub-e', name: 'あんず' }, { id: 'pub-f', name: 'いちご', photoId: 'ph-1' }]);
  assert.deepEqual(parseRegularLegends(snapshot), []);
  const loaded = await fetchRegularSnapshot(async () => ok(body));
  assert.equal(loaded.badges.get('pub-e'), 'legend');
  assert.deepEqual(loaded.legends.map((l) => l.id), ['pub-e', 'pub-f']);
  assert.deepEqual((await fetchRegularSnapshot(async () => { throw new Error('offline'); })).legends, []);
});
