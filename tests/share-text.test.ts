import assert from 'node:assert/strict';
import test from 'node:test';
import { prefectureBadgeShareText } from '../src/lib/share';

test('制覇後に新しいポケふたが増えたら「また行く」文面にする', () => {
  assert.equal(
    prefectureBadgeShareText('高知県', 18, 18, true, 5),
    '高知県のポケふた18枚を制覇済み。新しく増えたポケふたも、あと5枚まわりに行きます！'
  );
  // 増えた5枚のうち2枚まわったあと。「3枚増えた」と言わない
  assert.match(prefectureBadgeShareText('高知県', 20, 18, true, 3), /あと3枚まわりに行きます/);
});

test('増えていなければ今までどおり', () => {
  assert.equal(prefectureBadgeShareText('高知県', 18, 18, true), '高知県のポケふた18枚、全部まわりました！');
  assert.equal(prefectureBadgeShareText('高知県', 15, 18, false), '高知県のポケふた、あと3枚でコンプリートです！');
});

test('新しいポケふたの枚数は、制覇後に増えた分だけを数える', async () => {
  const { newUnvisitedSinceEarned } = await import('../src/lib/prefecture-new-manholes');
  const earnedAt = '2026-04-25T00:00:00Z';
  assert.equal(newUnvisitedSinceEarned({ earnedAt, total: 23, earnedTotal: 18, remaining: 5 }), 5);
  // 新しい分を2枚まわった
  assert.equal(newUnvisitedSinceEarned({ earnedAt, total: 23, earnedTotal: 18, remaining: 3 }), 3);
  // 増えていないのに訪問を非公開にした県は「新しい」と言わない
  assert.equal(newUnvisitedSinceEarned({ earnedAt, total: 18, earnedTotal: 18, remaining: 1 }), 0);
  assert.equal(newUnvisitedSinceEarned({ earnedAt: null, total: 23, earnedTotal: 0, remaining: 5 }), 0);
});
