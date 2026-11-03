import test from 'node:test';
import assert from 'node:assert/strict';

import { SUBMISSION_BLOCK_REASONS } from '../src/lib/analytics/gtag.ts';
import { SUBMISSION_ERROR_TYPES } from '../src/lib/analytics/submission-error.ts';
import { makeErrorRef, withErrorRef } from '../src/lib/error-ref.ts';

test('止まった理由・失敗の分類ごとに、読み分けられる前置きが付く', () => {
  const prefixes = new Map<string, string>();
  for (const reason of [...SUBMISSION_BLOCK_REASONS, ...SUBMISSION_ERROR_TYPES]) {
    const ref = makeErrorRef(reason);
    assert.match(ref, /^[A-Z]{2,4}-[2-9A-HJKMNP-TW-Z]{4}$/, `${reason}: ${ref}`);
    const prefix = ref.split('-')[0];
    assert.ok(!prefixes.has(prefix), `${reason} と ${prefixes.get(prefix)} が同じ前置き ${prefix}`);
    prefixes.set(prefix, reason);
  }
});

test('後半は回ごとに変わる', () => {
  const refs = new Set(Array.from({ length: 50 }, () => makeErrorRef('invalid_gps')));
  assert.ok(refs.size > 45);
});

test('エラー文の末尾にコードを付ける', () => {
  assert.equal(withErrorRef('写真に位置情報がありません。', 'GPS-7K3Q'), '写真に位置情報がありません。（エラーコード: GPS-7K3Q）');
});
