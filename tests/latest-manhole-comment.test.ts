import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LATEST_COMMENT_PREVIEW_CHARS,
  summarizeManholeComments,
} from '../src/lib/latest-manhole-comment';

test('蓋ごとに件数を数え、いちばん新しい1件を選ぶ', () => {
  const { counts, latest } = summarizeManholeComments([
    { manhole_id: 1, content: '古い', created_at: '2026-09-01T00:00:00+00:00' },
    { manhole_id: 1, content: '新しい', created_at: '2026-09-20T00:00:00.5+00:00' },
    { manhole_id: 1, content: '中間', created_at: '2026-09-10T00:00:00+00:00' },
    { manhole_id: 2, content: '別の蓋', created_at: '2026-09-05T00:00:00+00:00' },
  ]);
  assert.equal(counts.get(1), 3);
  assert.equal(counts.get(2), 1);
  assert.equal(latest.get(1)?.content, '新しい');
  assert.equal(latest.get(2)?.content, '別の蓋');
});

test('空白だけの本文は数えるが抜粋には選ばない', () => {
  const { counts, latest } = summarizeManholeComments([
    { manhole_id: 1, content: '中身あり', created_at: '2026-09-01T00:00:00+00:00' },
    { manhole_id: 1, content: '  \n ', created_at: '2026-09-02T00:00:00+00:00' },
  ]);
  assert.equal(counts.get(1), 2);
  assert.equal(latest.get(1)?.content, '中身あり');
});

test('改行は詰め、長い本文は文字単位で切る', () => {
  const long = 'あ'.repeat(LATEST_COMMENT_PREVIEW_CHARS + 5);
  const { latest } = summarizeManholeComments([
    { manhole_id: 1, content: '一行目\n\n二行目', created_at: '2026-09-01T00:00:00+00:00' },
    { manhole_id: 2, content: long, created_at: '2026-09-01T00:00:00+00:00' },
  ]);
  assert.equal(latest.get(1)?.content, '一行目 二行目');
  assert.equal(latest.get(2)?.content, `${'あ'.repeat(LATEST_COMMENT_PREVIEW_CHARS)}…`);
});

test('manhole_id の無い行は無視する', () => {
  const { counts, latest } = summarizeManholeComments([
    { manhole_id: null, content: 'x', created_at: '2026-09-01T00:00:00+00:00' },
  ]);
  assert.equal(counts.size, 0);
  assert.equal(latest.size, 0);
});
