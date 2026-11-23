import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GIFT_DAYS,
  canOfferGift,
  giftDaysLeft,
  giftUntilFor,
  isGiftActive,
} from '../src/lib/visit-gift.ts';

const NOW = new Date('2026-11-23T12:00:00+09:00');

test('期限は撮影日時から10日後', () => {
  assert.equal(GIFT_DAYS, 10);
  assert.equal(
    giftUntilFor('2026-11-20T09:00:00+09:00')?.toISOString(),
    new Date('2026-11-30T09:00:00+09:00').toISOString()
  );
  assert.equal(giftUntilFor('not a date'), null);
});

test('撮影から10日を過ぎた訪問には印を付けられない', () => {
  assert.equal(canOfferGift('2026-11-14T12:00:01+09:00', NOW), true);
  assert.equal(canOfferGift('2026-11-13T12:00:00+09:00', NOW), false);
  // 古い写真をまとめて投稿しても、印が大量に出ない
  assert.equal(canOfferGift('2025-08-01T10:00:00+09:00', NOW), false);
});

test('印の有効判定', () => {
  assert.equal(isGiftActive(null, NOW), false);
  assert.equal(isGiftActive('2026-11-23T12:00:01+09:00', NOW), true);
  assert.equal(isGiftActive('2026-11-23T11:59:59+09:00', NOW), false);
});

test('「あと N日」は切り上げ、切れたら0', () => {
  assert.equal(giftDaysLeft('2026-11-23T13:00:00+09:00', NOW), 1);
  assert.equal(giftDaysLeft('2026-11-30T12:00:00+09:00', NOW), 7);
  assert.equal(giftDaysLeft('2026-11-22T12:00:00+09:00', NOW), 0);
  assert.equal(giftDaysLeft(undefined, NOW), 0);
});
