import test from 'node:test';
import assert from 'node:assert/strict';

import { splitJapanesePhrases } from '../src/lib/japanese-phrases.ts';

/**
 * 折り返しの見た目そのものはブラウザ任せなので、ここで担保するのは
 * 「どこで切るか」だけ。実際に1〜2文字が取り残されていないかは
 * ブラウザで行分割を採取して確認している。
 */

test('句点・読点の直後で切り、区切り文字は前の句に残す', () => {
  assert.deepEqual(
    splitJapanesePhrases('登録すると訪問済みと照らし合わせて、称号つきの候補を探せます。'),
    ['登録すると訪問済みと照らし合わせて、', '称号つきの候補を探せます。']
  );
});

test('句点が行頭に来ないよう、文末の「。」は前の句に付く', () => {
  const phrases = splitJapanesePhrases('30秒でスタンプ帳ができます。すでにお持ちの方はログインへ。');
  assert.deepEqual(phrases, ['30秒でスタンプ帳ができます。', 'すでにお持ちの方はログインへ。']);
  assert.ok(phrases.every((phrase) => !phrase.startsWith('。')));
});

test('区切りが無い文はそのまま1句として返す', () => {
  assert.deepEqual(splitJapanesePhrases('全国のポケふたを写真で埋めよう'), ['全国のポケふたを写真で埋めよう']);
});

test('空文字は句を作らない', () => {
  assert.deepEqual(splitJapanesePhrases(''), []);
});

test('連続した区切り文字で空の句を作らない', () => {
  assert.deepEqual(splitJapanesePhrases('本当に？そう。'), ['本当に？', 'そう。']);
});

test('中黒でも切る（並列が長いと句点まで1行に入らないため）', () => {
  assert.deepEqual(
    splitJapanesePhrases('ポケふた図鑑で、都道府県・登場ポケモン・地図から次の目的地を探せます。'),
    ['ポケふた図鑑で、', '都道府県・', '登場ポケモン・', '地図から次の目的地を探せます。']
  );
});

test('割った句を連結すると元の文に戻る（文字を落とさない）', () => {
  const text = '全国の設置情報を、都道府県・登場ポケモン・地図から調べられます。訪問記録も残せます。';
  assert.equal(splitJapanesePhrases(text).join(''), text);
});
