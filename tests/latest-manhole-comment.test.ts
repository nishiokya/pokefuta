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

test('まとめて読んだ口コミから蓋ごとの抜粋を作る（上限に届かなければ読み直さない）', async () => {
  const { pickLatestComments } = await import('../src/lib/latest-manhole-comment.ts');
  const rows = [
    { manhole_id: 2, content: '  ', created_at: '2026-11-03T00:00:00Z' },
    { manhole_id: 1, content: '新しい', created_at: '2026-11-02T00:00:00Z' },
    { manhole_id: 2, content: '空白の次', created_at: '2026-11-01T00:00:00Z' },
    { manhole_id: 1, content: '古い', created_at: '2026-10-01T00:00:00Z' },
  ];
  const { previews, refetch } = pickLatestComments(rows, [1, 2, 3], false);
  assert.equal(previews.get(1)?.content, '新しい');
  assert.equal(previews.get(2)?.content, '空白の次');
  assert.equal(previews.get(3), null);
  assert.deepEqual(refetch, []);
});

test('上限で切られたときは、抜粋を作れなかった蓋だけ読み直しに回す', async () => {
  const { pickLatestComments } = await import('../src/lib/latest-manhole-comment.ts');
  const rows = [
    { manhole_id: 1, content: 'ある', created_at: '2026-11-02T00:00:00Z' },
    { manhole_id: 2, content: ' ', created_at: '2026-11-01T00:00:00Z' },
  ];
  const { previews, refetch } = pickLatestComments(rows, [1, 2, 3], true);
  assert.equal(previews.get(1)?.content, 'ある');
  assert.deepEqual(refetch, [2, 3]);
  assert.equal(previews.has(2), false);
});
