/**
 * 投稿失敗のクライアント側分類。
 *
 * サーバーが `code` を返せた場合は `p_submission_failed.error_code` の方が正確で、
 * ここは**それが取れなかったとき**（回線断・タイムアウト・想定外の応答）の受け皿。
 * 両系統で同じ規則を使う — キャラふた側だけがこの分類を持っていたため、
 * デザインふたの失敗は長く「stage しか判らない」状態だった。
 */

/**
 * 失敗の型。**先に判定したものが勝つ**（下の順序が排他の根拠）ので、
 * 値を足すときは順序のどこに割り込むのかまで決める。
 */
export const SUBMISSION_ERROR_TYPES = [
  'unauthorized',   // 401。セッション切れ
  'file_size',      // 413、または容量超過を示すメッセージ
  'server',         // 5xx。こちら側の障害
  'rejected',       // その他の 4xx。入力が受け付けられなかった
  'network',        // 応答が無い（回線断・CORS・中断）
  'gps_validation', // 座標の検証で落ちた
  'unknown',        // 分類できない。ここが増えたら分類を足す合図
] as const;

export type SubmissionErrorType = (typeof SUBMISSION_ERROR_TYPES)[number];

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/**
 * @param error   catch した例外
 * @param statusCode サーバーが応答していれば、その HTTP ステータス
 */
export function classifyClientSubmissionError(
  error: unknown,
  statusCode?: number
): SubmissionErrorType {
  const message = messageOf(error);

  // サーバーが答えているなら、ステータスが最も確かな手がかり。
  // メッセージの部分一致より先に見る（文言を変えただけで分類が動くのを防ぐ）。
  if (typeof statusCode === 'number' && statusCode > 0) {
    if (statusCode === 401 || statusCode === 403) return 'unauthorized';
    if (statusCode === 413) return 'file_size';
    if (statusCode >= 500) return 'server';
    if (statusCode >= 400) return 'rejected';
  }

  // 応答が無かった場合。fetch は回線断・中断で TypeError を投げる
  if (
    (error && typeof error === 'object' && (error as { name?: unknown }).name === 'TypeError') ||
    /network|failed to fetch|load failed|aborted/i.test(message)
  ) {
    return 'network';
  }

  if (/401|unauthorized|セッション/i.test(message)) return 'unauthorized';
  if (/size|large|容量/i.test(message)) return 'file_size';
  if (/gps|location|座標|位置情報/i.test(message)) return 'gps_validation';

  return 'unknown';
}
