import test from 'node:test';
import assert from 'node:assert/strict';
import { manholeDexUrl, prefectureDexUrl } from '../src/lib/prefectureSlug.ts';

test('同じ蓋の図鑑ページURL', () => {
  assert.equal(manholeDexUrl(128), 'https://data.pokefuta.com/manholes/128/');
  assert.equal(manholeDexUrl('486'), 'https://data.pokefuta.com/manholes/486/');
});

test('数値でない id ではリンクを作らない', () => {
  // URL に埋める前に弾く。想定外の値でパスを組み立てない。
  assert.equal(manholeDexUrl(null), null);
  assert.equal(manholeDexUrl(undefined), null);
  assert.equal(manholeDexUrl(''), null);
  assert.equal(manholeDexUrl('../../evil'), null);
  assert.equal(manholeDexUrl('128?x=1'), null);
  assert.equal(manholeDexUrl('12 8'), null);
});

test('都道府県ページURLは従来どおり', () => {
  assert.equal(prefectureDexUrl('宮城県'), 'https://data.pokefuta.com/prefectures/miyagi/');
  assert.equal(prefectureDexUrl('架空県'), null);
  assert.equal(prefectureDexUrl(null), null);
});
