import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LATEST_COMMENT_PREVIEW_CHARS,
  toLatestCommentPreview,
} from '../src/lib/latest-manhole-comment';

test('新しい順の先頭を抜粋にする', () => {
  const preview = toLatestCommentPreview([
    { content: '新しい', created_at: '2026-09-20T00:00:00+00:00' },
    { content: '古い', created_at: '2026-09-01T00:00:00+00:00' },
  ]);
  assert.deepEqual(preview, { content: '新しい', created_at: '2026-09-20T00:00:00+00:00' });
});

test('空白だけの本文は飛ばして次の1件にする', () => {
  const preview = toLatestCommentPreview([
    { content: '  \n ', created_at: '2026-09-02T00:00:00+00:00' },
    { content: '中身あり', created_at: '2026-09-01T00:00:00+00:00' },
  ]);
  assert.equal(preview?.content, '中身あり');
});

test('改行は詰め、長い本文は文字単位で切る', () => {
  assert.equal(
    toLatestCommentPreview([{ content: '一行目\n\n二行目', created_at: '2026-09-01T00:00:00+00:00' }])?.content,
    '一行目 二行目'
  );
  const long = 'あ'.repeat(LATEST_COMMENT_PREVIEW_CHARS + 5);
  assert.equal(
    toLatestCommentPreview([{ content: long, created_at: '2026-09-01T00:00:00+00:00' }])?.content,
    `${'あ'.repeat(LATEST_COMMENT_PREVIEW_CHARS)}…`
  );
});

test('使える行が無ければ null', () => {
  assert.equal(toLatestCommentPreview([]), null);
  assert.equal(toLatestCommentPreview([{ content: ' ', created_at: '2026-09-01T00:00:00+00:00' }]), null);
});
