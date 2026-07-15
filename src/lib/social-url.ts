// プロフィールのSNSリンクは https の X / Instagram プロフィールURLのみ許可する。
// DB制約(025)・API(/api/user/profile)と同じルールをリンク描画側でも最終確認し、
// 想定外のドメインへのリンクを絶対に出さない。

export const X_HOSTS = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'];
export const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com'];

export function safeSocialUrl(value: string | null | undefined, hosts: string[]): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!hosts.includes(url.hostname.toLowerCase())) return null;
    if (url.pathname.split('/').filter(Boolean).length !== 1) return null;
    return url.toString();
  } catch {
    return null;
  }
}
