import type { SubmissionBlockReason } from '@/lib/analytics/gtag';
import type { SubmissionErrorType } from '@/lib/analytics/submission-error';

/**
 * 投稿で止まった・失敗したときにエラー文の末尾へ付ける問い合わせ用のコード（例: `GPS-7K3Q`）。
 *
 * 問い合わせ（X の DM など）は「写真によって送れない」のように症状しか書かれないことが多く、
 * どこで止まったのか本人に聞き返す往復が要る。コードを送ってもらえば:
 * - 前半で止まった理由が分かる（GA4 を見なくてもよい）
 * - 後半の4文字で、同じ値を `error_ref` に載せた GA4 のイベント（端末・時刻・写真の入手元）を引ける
 *
 * 後半は識別子ではなく、その回ごとの乱数。利用者を特定する情報は入れない。
 */
const PREFIX: Record<SubmissionBlockReason | SubmissionErrorType, string> = {
  // 送信前に止まった（block_reason）
  invalid_gps: 'GPS',
  no_nearby_manhole: 'NEAR',
  too_far: 'FAR',
  manhole_location_missing: 'LOC',
  manholes_unavailable: 'LIST',
  official_manhole_nearby: 'OFFI',
  unsupported_format: 'FMT',
  suspended: 'STOP',
  // 送信したが失敗した（error_type）
  unauthorized: 'AUTH',
  file_size: 'SIZE',
  server: 'SRV',
  rejected: 'REJ',
  network: 'NET',
  gps_validation: 'GPSV',
  unknown: 'UNK',
};

// 読み間違えやすい 0/O・1/I/L・U/V を除く
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';

function randomSuffix(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

export function makeErrorRef(reason: SubmissionBlockReason | SubmissionErrorType): string {
  return `${PREFIX[reason]}-${randomSuffix()}`;
}

/** エラー文の末尾にコードを付ける。問い合わせで送ってもらう前提の書き方にする。 */
export function withErrorRef(message: string, ref: string): string {
  return `${message}（エラーコード: ${ref}）`;
}
