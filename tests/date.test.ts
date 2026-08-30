import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPhotoDateJst, formatPhotoDateJstCompact } from '../src/lib/date';

// Intl に timeZone を明示しているので、これらの期待値は実行環境の TZ に依らない。
// 逆に言うと、ローカルの getFullYear/getMonth/getDate に戻した瞬間に落ちる。

test('photo dates are formatted in JST, not the viewer timezone', () => {
  // manhole/82 の @かいあ の1枚。UTC では 8/30 04:48、JST では 8/30 13:48。
  // 実装が閲覧者のローカル時刻を使うと、UTC-8 の閲覧者には 8/29 と出る。
  assert.equal(formatPhotoDateJst('2026-08-30T04:48:32+00:00'), '2026/8/30');

  // JST で日付が繰り上がる側。UTC 8/29 16:00 = JST 8/30 01:00。
  assert.equal(formatPhotoDateJst('2026-08-29T16:00:00Z'), '2026/8/30');

  // JST でまだ前日の側。UTC 8/29 14:59 = JST 8/29 23:59。
  assert.equal(formatPhotoDateJst('2026-08-29T14:59:00Z'), '2026/8/29');
});

test('the year is dropped only for photos from the current JST year', () => {
  // 「今年」も JST で求める。実行環境ローカルの getFullYear() で組み立てると、
  // UTC の CI ランナー上では 12/31 15:00〜24:00 UTC（= JST の元日）の9時間だけ
  // 年がズレて落ちる。JST の正しさを見るテストが TZ に依存しては意味がない。
  const thisYear = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date())
  );
  assert.equal(formatPhotoDateJstCompact(`${thisYear}-08-30T04:48:32+00:00`), '8/30');
  assert.equal(formatPhotoDateJstCompact('2024-07-13T00:00:00Z'), '2024/7/13');
});

test('the year boundary is judged in JST', () => {
  // UTC 2025-12-31 16:00 = JST 2026-01-01 01:00。年またぎで年の表示が変わる。
  assert.equal(formatPhotoDateJst('2025-12-31T16:00:00Z'), '2026/1/1');
  assert.equal(formatPhotoDateJst('2025-12-31T14:59:00Z'), '2025/12/31');
});

test('unparseable values format as an empty string instead of NaN', () => {
  assert.equal(formatPhotoDateJst('not-a-date'), '');
  assert.equal(formatPhotoDateJstCompact('not-a-date'), '');
});
