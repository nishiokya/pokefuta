import assert from 'node:assert/strict';
import test from 'node:test';
import { prefectureBadgeShareText } from '../src/lib/share';

test('制覇後に新しいポケふたが増えたら「また行く」文面にする', () => {
  assert.equal(
    prefectureBadgeShareText('高知県', 18, 18, true, 5),
    '高知県のポケふた18枚を制覇済み。新しいポケふたが5枚増えたので、また行きます！'
  );
});

test('増えていなければ今までどおり', () => {
  assert.equal(prefectureBadgeShareText('高知県', 18, 18, true), '高知県のポケふた18枚、全部まわりました！');
  assert.equal(prefectureBadgeShareText('高知県', 15, 18, false), '高知県のポケふた、あと3枚でコンプリートです！');
});
