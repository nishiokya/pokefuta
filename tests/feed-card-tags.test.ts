import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseByPoster,
  feedCardTags,
  isNightShot,
  regionalFormOf,
  isFreshShot,
  isMemoryShot,
  rarityOf,
  sameDayVisitorCounts,
} from '../src/lib/feed-card-tags.ts';

const NOW = new Date('2026-09-25T12:00:00+09:00').getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

test('撮れたて・思い出は撮影日で見る', () => {
  assert.equal(isFreshShot(daysAgo(5), NOW), true);
  assert.equal(isFreshShot(daysAgo(8), NOW), false);
  // カメラの日付を誤った未来の1枚には付けない
  assert.equal(isFreshShot(daysAgo(-30), NOW), false);
  assert.equal(isMemoryShot(daysAgo(400), NOW), true);
  assert.equal(isMemoryShot(daysAgo(200), NOW), false);
});

test('5日前の写真は撮れたて、1年以上前の写真は思い出の1枚', () => {
  const base = { id: 'a', manhole_id: 1, manhole: { pokemons: ['ミジュマル'] } };
  assert.deepEqual(feedCardTags({ ...base, shot_at: daysAgo(5) }, undefined, NOW), [
    { tag: 'fresh', label: '撮れたて' },
  ]);
  assert.deepEqual(
    feedCardTags({ ...base, shot_at: daysAgo(407) }, undefined, NOW),
    [{ tag: 'memory', label: '思い出の1枚' }]
  );
});

test('伝説・幻は蓋のポケモンで判定し、幻を優先する', () => {
  assert.equal(rarityOf(['ダーテング', 'チコリータ']), null);
  assert.equal(rarityOf(['ホウオウ']), 'legendary');
  assert.equal(rarityOf(['ライコウ', 'ミュウ']), 'mythical');
  assert.equal(rarityOf(null), null);
});

test('同じ蓋・同じ日（JST）に別の人が撮ったら人数を返す。同じ人の2枚は1人', () => {
  const v = (id: string, who: string, manhole_id: number, shot_at: string) => ({
    id, manhole_id, public_user_id: who, shot_at,
  });
  const counts = sameDayVisitorCounts([
    v('1', 'maru', 161, '2026-09-24T01:00:00Z'),
    v('2', 'conan', 161, '2026-09-24T14:00:00Z'), // JST では 9/24 23時
    v('3', 'maru', 161, '2026-09-24T15:30:00Z'), // JST では 9/25 → 別の日
    v('4', 'kanta', 209, '2026-09-24T01:00:00Z'),
    v('5', 'kanta', 209, '2026-09-24T02:00:00Z'),
  ]);
  assert.equal(counts.get('1'), 2);
  assert.equal(counts.get('2'), 2);
  assert.equal(counts.has('3'), false);
  assert.equal(counts.has('4'), false);
});

test('公開IDの無い投稿は同じ日の人数に数えない（内部の user_id には頼らない）', () => {
  const counts = sameDayVisitorCounts([
    { id: '1', manhole_id: 161, public_user_id: 'maru', shot_at: '2026-09-24T01:00:00Z' },
    { id: '2', manhole_id: 161, public_user_id: null, user_id: 'auth-uid', shot_at: '2026-09-24T02:00:00Z' } as never,
  ]);
  assert.equal(counts.size, 0);
});

test('チップは最大2つ、珍しい順', () => {
  const tags = feedCardTags(
    { id: 'x', manhole_id: 159, shot_at: daysAgo(2), manhole: { pokemons: ['ホウオウ'] } },
    3,
    NOW
  );
  assert.deepEqual(tags.map((c) => c.label), ['伝説', '同じ日に3人']);
});

test('夜ふたは JST の 20:00〜4:59', () => {
  assert.equal(isNightShot('2026-09-24T11:00:00Z'), true); // JST 20:00
  assert.equal(isNightShot('2026-09-24T19:59:00Z'), true); // JST 4:59
  assert.equal(isNightShot('2026-09-24T20:00:00Z'), false); // JST 5:00
  assert.equal(isNightShot('2026-09-24T10:59:00Z'), false); // JST 19:59
});

test('リージョンフォームは名前の頭の地方名で拾う', () => {
  assert.equal(regionalFormOf(['アローラナッシー', 'ナッシー']), 'アローラ');
  assert.equal(regionalFormOf(['ヒスイガーディ']), 'ヒスイ');
  assert.equal(regionalFormOf(['ガーディ']), null);
});

test('ピカチュウ・すがた・夜ふたも優先順どおり最大2つ', () => {
  const chips = feedCardTags(
    { id: 'p', manhole_id: 1, shot_at: '2025-01-01T13:00:00Z', manhole: { pokemons: ['アローラライチュウ'] } },
    undefined,
    NOW
  );
  assert.deepEqual(chips.map((c) => c.label), ['ピカチュウ', 'アローラのすがた']);
});

test('同じ人の7枚目以降を7枚目の位置で1枚に畳み、1日の最多枚数を数える', () => {
  const v = (id: string, who: string | null, manhole_id: number, shot_at = '2026-08-19T03:00:00Z') => ({
    id, manhole_id, public_user_id: who, shot_at, display_name: who,
  });
  const visits = [
    ...Array.from({ length: 9 }, (_, i) => v(`y${i}`, 'yamato', 100 + i)),
    v('h1', 'hopi', 1),
    v('anon1', null, 2),
    v('y9', 'yamato', 200, '2023-08-20T03:00:00Z'),
  ];
  const out = collapseByPoster(visits);
  assert.deepEqual(
    out.map((item) => (item.kind === 'visit' ? item.visit.id : `collapsed:${item.hidden.length}`)),
    ['y0', 'y1', 'y2', 'y3', 'y4', 'y5', 'collapsed:4', 'h1', 'anon1']
  );
  const group = out[6];
  assert.ok(group.kind === 'collapsed');
  assert.equal(group.busiestDay, 9);
  assert.equal(group.public_user_id, 'yamato');
});
