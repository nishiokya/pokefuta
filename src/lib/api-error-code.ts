/**
 * 投稿APIが返す機械可読なエラーコード。
 *
 * 背景（2026-08-09）:
 * `design_manhole` への INSERT が存在しない列を指して PostgREST の `PGRST204` で全失敗したが、
 * API が例外を「投稿に失敗しました。時間をおいて再度お試しください」に丸めていたため、
 * 本番画面からもGA4からも原因が見えず2日間気づかれなかった。
 *
 * 利用者向けの文言は変えずに、**機械可読な `code` を並べて返す**。
 * クライアントはこれを `p_submission_failed.error_code` に載せるので、
 * 同じ事故が起きれば GA4 上で `DB_SCHEMA_MISMATCH` として数分で見える。
 *
 * 生のDBメッセージはクライアントへ返さない（サーバーの console.error には残す）。
 */

export const SUBMISSION_ERROR_CODES = [
  /** マイグレーション未適用など、コードとスキーマがズレている */
  'DB_SCHEMA_MISMATCH',
  /** RLS・権限で弾かれた。スキーマは認識できている */
  'DB_PERMISSION_DENIED',
  /** R2 などストレージ層の失敗 */
  'STORAGE_ERROR',
  /** 分類できなかった。増えているなら分類を足す */
  'UNEXPECTED',
] as const;

export type SubmissionErrorCode = (typeof SUBMISSION_ERROR_CODES)[number];

/**
 * スキーマのズレを示すコード。PostgREST のスキーマキャッシュに無い、の3種:
 *   PGRST202 = 関数 / PGRST204 = 列（今回の事故） / PGRST205 = テーブル
 * Postgres 側の同種の訴えが 42703(undefined_column) / 42P01(undefined_table)。
 *
 * テーブルごと未適用のマイグレーションは PGRST205 で来る。列の欠落と同じ事故クラス
 * なので、ここから漏らすと error_code が UNEXPECTED に丸まって区別できなくなる。
 */
const SCHEMA_MISMATCH_CODES = new Set([
  'PGRST202',
  'PGRST204',
  'PGRST205',
  '42703',
  '42P01',
]);

/**
 * 権限で弾かれたコード。`42501` は RLS 違反も含む。
 * スキーマは認識できているので `DB_SCHEMA_MISMATCH` と切り分ける
 * （この2つの取り違えが今回の切り分けを遅らせた）。
 */
const PERMISSION_DENIED_CODES = new Set(['42501', 'PGRST301']);

/** cause の鎖を辿る。非オブジェクトで打ち切り、循環参照でも止まる。 */
function causeChain(error: unknown): object[] {
  const chain: object[] = [];
  const seen = new Set<object>();
  let current = error;
  // 実際の鎖は深くても2〜3段。壊れた入力で無限に回らないよう上限も置く。
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object') break;
    const node = current as object;
    if (seen.has(node)) break;
    seen.add(node);
    chain.push(node);
    current = (node as { cause?: unknown }).cause;
  }
  return chain;
}

function readCode(value: object): string | undefined {
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : undefined;
}

/**
 * @aws-sdk/client-s3 の例外は $metadata を持つ。
 * ただし r2.ts が Error で包み直すので、cause 側にしか無いことがある。
 */
function hasStorageMarker(value: object): boolean {
  return '$metadata' in value;
}

/**
 * 例外を機械可読なコードに分類する。
 *
 * @param fallback 分類できなかったときのコード。ストレージ操作を包む catch では
 *                 'STORAGE_ERROR' を渡す（AWS SDK 以外の失敗も拾うため）。
 */
export function classifySubmissionError(
  error: unknown,
  fallback: SubmissionErrorCode = 'UNEXPECTED'
): SubmissionErrorCode {
  const chain = causeChain(error);

  // DBのコードを優先する。ストレージ判定より先に見るのは、
  // 「スキーマがズレている」の方が対処が具体的だから。
  for (const node of chain) {
    const code = readCode(node);
    if (!code) continue;
    if (SCHEMA_MISMATCH_CODES.has(code)) return 'DB_SCHEMA_MISMATCH';
    if (PERMISSION_DENIED_CODES.has(code)) return 'DB_PERMISSION_DENIED';
  }

  if (chain.some(hasStorageMarker)) return 'STORAGE_ERROR';

  return fallback;
}
