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
 * スキーマのズレを示すコード。
 * `PGRST204` は PostgREST のスキーマキャッシュに列が無い場合で、今回の事故がこれ。
 * `42703`(undefined_column) / `42P01`(undefined_table) は Postgres 側の同種の訴え。
 */
const SCHEMA_MISMATCH_CODES = new Set(['PGRST204', 'PGRST202', '42703', '42P01']);

/**
 * 権限で弾かれたコード。`42501` は RLS 違反も含む。
 * スキーマは認識できているので `DB_SCHEMA_MISMATCH` と切り分ける
 * （この2つの取り違えが今回の切り分けを遅らせた）。
 */
const PERMISSION_DENIED_CODES = new Set(['42501', 'PGRST301']);

function readCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : undefined;
}

/** supabase-js の PostgrestError は Error でラップされることがあるので cause も辿る。 */
function extractCode(error: unknown): string | undefined {
  return readCode(error) ?? readCode((error as { cause?: unknown } | null)?.cause);
}

/** @aws-sdk/client-s3 の例外は $metadata を持つ。 */
function isStorageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return '$metadata' in error || '$metadata' in (((error as { cause?: object }).cause ?? {}) as object);
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
  const code = extractCode(error);

  if (code) {
    if (SCHEMA_MISMATCH_CODES.has(code)) return 'DB_SCHEMA_MISMATCH';
    if (PERMISSION_DENIED_CODES.has(code)) return 'DB_PERMISSION_DENIED';
  }

  if (isStorageError(error)) return 'STORAGE_ERROR';

  return fallback;
}
