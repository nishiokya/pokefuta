import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTagChips,
  cardTags,
  isValidTagSlug,
  parseDesignManholeTagData,
  relatedChips,
  tagHref,
  topLevelChips,
} from '../src/lib/design-manhole-tag-data';

// 図鑑の api/design_manhole_tags.json と同じ形
const RAW = {
  success: true,
  generated_at: '2026-11-15T19:54:37+09:00',
  groups: [
    { slug: 'gundam', label: 'ガンダム', name: '機動戦士ガンダム', category: 'anime', kind: 'catalog', parent: null,
      experimental: false, photos: 2, spots: 54, spots_with_photo: 23, guide_url: 'https://data.pokefuta.com/characters/gundam/' },
    { slug: 'cinnamoroll', label: 'シナモロール', name: 'シナモロール', category: 'anime', kind: 'catalog', parent: null,
      experimental: false, photos: 0, spots: 8, spots_with_photo: 0, guide_url: null },
    { slug: 'baseball', label: '野球', name: '野球のマンホール', category: 'sports', kind: 'open', parent: null,
      experimental: true, photos: 2 },
    { slug: 'carp', label: 'カープ', name: '広島東洋カープ', category: 'sports', kind: 'open', parent: 'baseball',
      experimental: true, photos: 1 },
    { slug: 'tigers', label: '阪神', name: '阪神タイガース', category: 'sports', kind: 'open', parent: 'baseball',
      experimental: true, photos: 1 },
  ],
  posts: {
    g1: { tags: ['gundam'] },
    g2: { tags: ['gundam'] },
    c1: { tags: ['carp', 'baseball'] },
    t1: { tags: ['tigers', 'baseball'] },
    hidden: { tags: ['gundam'] },
  },
};

const DATA = parseDesignManholeTagData(RAW)!;
// 公開中の投稿（新しい順）。hidden は写真館で非公開にした投稿、plain はタグの無い投稿
const PUBLISHED = ['t1', 'g2', 'plain', 'c1', 'g1'];

test('図鑑の JSON をそのまま読める', () => {
  assert.equal(DATA.groups.length, 5);
  const gundam = DATA.groups[0];
  assert.deepEqual(
    [gundam.kind, gundam.spots, gundam.spotsWithPhoto, gundam.guideUrl],
    ['catalog', 54, 23, 'https://data.pokefuta.com/characters/gundam/'],
  );
  assert.equal(DATA.groups[2].spots, null);
  assert.deepEqual(DATA.tagsByPost.c1, ['carp', 'baseball']);
});

test('形の違う JSON は null（タグを出さない）', () => {
  assert.equal(parseDesignManholeTagData(null), null);
  assert.equal(parseDesignManholeTagData({ success: false, groups: [], posts: {} }), null);
  assert.equal(parseDesignManholeTagData({ success: true, groups: {}, posts: {} }), null);
});

test('おかしなグループ・タグはそれだけ捨てる', () => {
  const data = parseDesignManholeTagData({
    success: true,
    groups: [
      { slug: '../admin', label: 'x', name: 'x', kind: 'open' },
      { slug: 'ok', label: 'OK', name: 'OK', kind: 'open', guide_url: 'https://evil.example/', parent: 'missing' },
      { slug: 'ok', label: '重複', name: '重複', kind: 'open' },
      { slug: 'nolabel', label: '', name: 'x', kind: 'open' },
    ],
    posts: { a: { tags: ['ok', 'unknown', 'ok'] }, b: { tags: ['unknown'] }, c: {} },
  })!;
  assert.deepEqual(data.groups.map((g) => [g.slug, g.label, g.guideUrl, g.parent]), [['ok', 'OK', null, null]]);
  assert.deepEqual(data.tagsByPost, { a: ['ok'] });
});

test('slug は英小文字・数字・ハイフンだけ', () => {
  assert.equal(isValidTagSlug('zombieland-saga'), true);
  for (const bad of ['', 'Gundam', 'a_b', '-a', 'a--b', 'a/b', 'a'.repeat(41)]) {
    assert.equal(isValidTagSlug(bad), false, bad);
  }
});

test('チップの枚数は公開中の投稿で数え、写真の無いタグは出さない', () => {
  const chips = buildTagChips(DATA, PUBLISHED);
  assert.deepEqual(
    chips.map((c) => [c.group.slug, c.photos, c.coverId]),
    // 多い順。同じ枚数は台帳の順。丸い写真はいちばん新しい投稿
    [['gundam', 2, 'g2'], ['baseball', 2, 't1'], ['carp', 1, 'c1'], ['tigers', 1, 't1']],
  );
});

test('一覧の先頭は親を持たないタグ、タグのページの2段目は同じ親の子', () => {
  const chips = buildTagChips(DATA, PUBLISHED);
  assert.deepEqual(topLevelChips(chips).map((c) => c.group.slug), ['gundam', 'baseball']);
  assert.deepEqual(relatedChips(chips, 'baseball').map((c) => c.group.slug), ['carp', 'tigers']);
  assert.deepEqual(relatedChips(chips, 'carp').map((c) => c.group.slug), ['carp', 'tigers']);
  assert.deepEqual(relatedChips(chips, 'gundam'), []);
  assert.deepEqual(relatedChips(chips, 'no-such-tag'), []);
});

test('一覧の先頭のチップは、写真2枚以上のタグを多い順に8つまで', () => {
  const groups = Array.from({ length: 12 }, (_, i) => ({ slug: `t${i}`, label: `T${i}`, name: `T${i}`, kind: 'open' }));
  const posts: Record<string, { tags: string[] }> = {};
  // t0 は12枚、t1 は11枚 … t10 は2枚、t11 は1枚
  groups.forEach((g, i) => {
    for (let n = 0; n < 12 - i; n += 1) posts[`${g.slug}-${n}`] = { tags: [g.slug] };
  });
  const data = parseDesignManholeTagData({ success: true, groups, posts })!;
  const chips = buildTagChips(data, Object.keys(posts));
  assert.equal(chips.length, 12);
  assert.deepEqual(topLevelChips(chips).map((c) => c.group.slug), ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']);
  // 1枚だけのタグは、数に余裕があっても出さない
  assert.deepEqual(topLevelChips(chips.slice(9)).map((c) => c.group.slug), ['t9', 't10']);
});

test('カードのタグは2つまで。子のタグがあれば親は出さない', () => {
  const two = parseDesignManholeTagData({ ...RAW, posts: { x: { tags: ['gundam', 'carp', 'baseball', 'tigers'] } } })!;
  assert.deepEqual(cardTags(two, 'x').map((g) => g.label), ['ガンダム', 'カープ']);
  // 投稿のページは全部（親は出さない）
  assert.deepEqual(cardTags(two, 'x', 6).map((g) => g.label), ['ガンダム', 'カープ', '阪神']);
  assert.deepEqual(cardTags(DATA, 'c1').map((g) => g.label), ['カープ']);
  assert.deepEqual(cardTags(DATA, 'g1').map((g) => g.label), ['ガンダム']);
  assert.deepEqual(cardTags(DATA, 'plain'), []);
});

test('タグのページの URL', () => {
  assert.equal(tagHref('gundam'), '/design-manholes/tags/gundam');
  assert.equal(tagHref('gundam', 2), '/design-manholes/tags/gundam?page=2');
});
