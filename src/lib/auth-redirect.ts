// data.pokefuta.com（静的サイト側）からの SSO ログインのみ外部リダイレクトを許可
export const DATA_SITE_PREFIX = 'https://data.pokefuta.com/';

/** 新規登録後に戻る先が無いとき（ヘッダーの[新規登録]から来たとき）の行き先 */
const DEFAULT_SIGNUP_RETURN_PATH = '/upload';

export function getSafeRedirectPath(value: string | null | undefined) {
  if (!value) return '/';
  if (value.startsWith(DATA_SITE_PREFIX)) return value;
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

/**
 * メール新規登録の確認リンクで戻る先。ログインと同じく `?redirect=` を引き継ぐ。
 * 固定の /upload にしていたため、デザインマンホール投稿（/design-manholes/new）から
 * 登録した人がポケふたの投稿画面へ飛ばされていた。
 */
export function getSignupReturnPath(redirectTo: string) {
  const safe = getSafeRedirectPath(redirectTo);
  return safe === '/' ? DEFAULT_SIGNUP_RETURN_PATH : safe;
}
