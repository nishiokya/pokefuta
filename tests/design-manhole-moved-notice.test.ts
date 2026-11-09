import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMovedToPokefutaNoticeActive } from '../src/components/DesignManhole/MovedToPokefutaNotice';

test('移したお知らせは 2026-12-10（JST）まで出す', () => {
  assert.equal(isMovedToPokefutaNoticeActive(new Date('2026-11-10T08:00:00+09:00')), true);
  assert.equal(isMovedToPokefutaNoticeActive(new Date('2026-12-09T23:59:59+09:00')), true);
  assert.equal(isMovedToPokefutaNoticeActive(new Date('2026-12-10T00:00:00+09:00')), false);
});
