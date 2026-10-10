import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefectureDexUrl, resolvePrefectureParam } from '../src/lib/prefectureSlug.ts';

test('日本語の都道府県名をそのまま受ける', () => {
  assert.equal(resolvePrefectureParam('宮崎県'), '宮崎県');
  assert.equal(resolvePrefectureParam('北海道'), '北海道');
});

test('図鑑と同じローマ字 slug でも引ける', () => {
  assert.equal(resolvePrefectureParam('miyazaki'), '宮崎県');
  assert.equal(resolvePrefectureParam('HOKKAIDO'), '北海道');
});

test('多重エンコードされた URL でも拾う', () => {
  assert.equal(resolvePrefectureParam(encodeURIComponent('宮崎県')), '宮崎県');
});

test('都道府県でない値は null（転送せず 404 にする）', () => {
  assert.equal(resolvePrefectureParam('宮崎'), null);
  assert.equal(resolvePrefectureParam(''), null);
  assert.equal(resolvePrefectureParam('%E3%81%82%'), null);
});

test('プロトタイプの名前は都道府県として通さない', () => {
  assert.equal(resolvePrefectureParam('toString'), null);
  assert.equal(resolvePrefectureParam('__proto__'), null);
  assert.equal(prefectureDexUrl('toString'), null);
  assert.equal(prefectureDexUrl('constructor'), null);
});

test('旧県ページの転送先は図鑑の県ページ', () => {
  assert.equal(prefectureDexUrl(resolvePrefectureParam('tokyo')), 'https://data.pokefuta.com/prefectures/tokyo/');
  assert.equal(prefectureDexUrl(resolvePrefectureParam(encodeURIComponent('東京都'))), 'https://data.pokefuta.com/prefectures/tokyo/');
});
