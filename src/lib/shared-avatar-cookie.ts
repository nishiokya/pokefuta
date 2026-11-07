// 図鑑（data.pokefuta.com）のヘッダーに、写真館で選んだアイコンを出すためのクッキー。
//
// 図鑑は静的ページで、表示のたびに Supabase を読まない方針（pokefuta-tracker の
// apps/web/assets/session-badge.js）。なので写真館が、ログイン中の人のアイコンの写真ID を
// .pokefuta.com で共有するクッキーに書いておき、図鑑はそれを読んで画像を出すだけにする。
//
// 値は「auth の利用者ID.写真ID」。図鑑はログインクッキーの利用者ID と一致するときだけ使う
// （同じブラウザで別の人がログインし直したとき、前の人のアイコンを出さない）。
// 中身は本人のブラウザにある本人の ID と、公開写真の ID だけ。表示用で、認証には使わない。

export const SHARED_AVATAR_COOKIE = 'pf_avatar';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cookieAttributes(hostname: string, protocol: string) {
  const parts = ['path=/', 'samesite=lax'];
  if (hostname === 'pokefuta.com' || hostname.endsWith('.pokefuta.com')) parts.push('domain=.pokefuta.com');
  if (protocol === 'https:') parts.push('secure');
  return parts.join('; ');
}

/** 書くクッキーの文字列。photoId が null（未設定）なら消す */
export function sharedAvatarCookieString(
  authUid: string | null,
  photoId: string | null,
  location: { hostname: string; protocol: string }
): string {
  const attrs = cookieAttributes(location.hostname, location.protocol);
  if (!authUid || !photoId || !UUID_RE.test(authUid) || !UUID_RE.test(photoId)) {
    return `${SHARED_AVATAR_COOKIE}=; max-age=0; ${attrs}`;
  }
  return `${SHARED_AVATAR_COOKIE}=${authUid.toLowerCase()}.${photoId.toLowerCase()}; max-age=${MAX_AGE_SECONDS}; ${attrs}`;
}

export function writeSharedAvatarCookie(authUid: string | null, photoId: string | null) {
  if (typeof document === 'undefined') return;
  document.cookie = sharedAvatarCookieString(authUid, photoId, window.location);
}
