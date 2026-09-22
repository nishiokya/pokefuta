import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrefectureCompletion,
  type CompletionInput,
} from '../src/lib/prefecture-completion';

function manhole(prefecture: string, photoCount: number): CompletionInput {
  return { prefecture, photo_count: photoCount };
}

test('都道府県ごとに残り枚数を数える', () => {
  const rollup = buildPrefectureCompletion([
    manhole('香川県', 1),
    manhole('香川県', 0),
    manhole('香川県', 0),
  ]);

  assert.equal(rollup.listedCount, 1);
  assert.equal(rollup.incompleteCount, 1);
  assert.deepEqual(
    rollup.incomplete.map((entry) => [entry.prefecture, entry.missing, entry.coverage]),
    [['香川県', 2, 33]]
  );
});

test('全ての蓋に写真がある県はコンプリート扱いで incomplete に出さない', () => {
  const rollup = buildPrefectureCompletion([
    manhole('徳島県', 2),
    manhole('徳島県', 1),
  ]);

  assert.equal(rollup.completeCount, 1);
  assert.equal(rollup.incompleteCount, 0);
  assert.equal(rollup.missingTotal, 0);
});

test('設置状況は見ない（スナップショットが持っていないため）', () => {
  // 既知の穴。図鑑側の installed:false（現地にまだ無い蓋）に相当する項目が
  // data.pokefuta.com のスナップショットに無いので、設置予定の蓋も
  // 「写真が無い蓋」として残り枚数に入る。
  //
  // このテストは現状を固定するためのもので、望ましい挙動ではない。
  // スナップショットに設置状況が載ったら、除外する実装に変えてここも直す。
  const rollup = buildPrefectureCompletion([
    manhole('香川県', 1),
    manhole('香川県', 0),
  ]);

  assert.equal(rollup.incompleteCount, 1);
  assert.equal(rollup.missingTotal, 1);
});

test('ポケふたが無い都道府県は母数に入れない', () => {
  // 「未設置だからコンプリート」と「全部撮った」を同じ扱いにしないため。
  // この除外があるので listedCount は47ではなく、実際に設置がある県の数。
  const rollup = buildPrefectureCompletion([manhole('香川県', 1)]);

  assert.equal(rollup.listedCount, 1);
  assert.equal(rollup.completeCount, 1);
});

test('都道府県が空のレコードは数えない', () => {
  const rollup = buildPrefectureCompletion([
    manhole('香川県', 0),
    { prefecture: null, photo_count: 0 },
    { prefecture: '   ', photo_count: 0 },
  ]);

  assert.equal(rollup.listedCount, 1);
  assert.equal(rollup.missingTotal, 1);
});

test('残り枚数の少ない順に並ぶ（先頭が次に終わる県）', () => {
  const rollup = buildPrefectureCompletion([
    ...Array.from({ length: 10 }, () => manhole('長崎県', 1)),
    ...Array.from({ length: 5 }, () => manhole('長崎県', 0)),
    ...Array.from({ length: 15 }, () => manhole('香川県', 1)),
    ...Array.from({ length: 3 }, () => manhole('香川県', 0)),
    ...Array.from({ length: 20 }, () => manhole('宮崎県', 1)),
    ...Array.from({ length: 6 }, () => manhole('宮崎県', 0)),
  ]);

  assert.deepEqual(
    rollup.incomplete.map((entry) => [entry.prefecture, entry.missing]),
    [
      ['香川県', 3],
      ['長崎県', 5],
      ['宮崎県', 6],
    ]
  );
  assert.equal(rollup.missingTotal, 14);
});
