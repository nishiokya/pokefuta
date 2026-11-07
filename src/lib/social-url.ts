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

// 入力を保存できる形（https://<host>/<ユーザー名>）に寄せる。
// 「x.com/foo」「@foo」「foo」「http://x.com/foo?s=21」のような入力を受けて、
// API（isSocialUrl）と DB の正規表現が通る形にする。寄せられない入力はそのまま返し、検査で落とす。
export type SocialSite = {
  /** ユーザー名だけが入力されたときに使うホスト */
  defaultHost: string;
  /** 受け付けるホスト（小文字） */
  hosts: string[];
};

export const X_SITE: SocialSite = { defaultHost: 'x.com', hosts: X_HOSTS };
export const INSTAGRAM_SITE: SocialSite = { defaultHost: 'instagram.com', hosts: INSTAGRAM_HOSTS };

const HANDLE = /^[A-Za-z0-9_.]+$/;

export function normalizeSocialUrl(input: string, site: SocialSite): string {
  const value = input.trim();
  if (!value) return '';

  // @foo / foo（ユーザー名だけ）
  const handle = value.startsWith('@') ? value.slice(1) : value;
  if (HANDLE.test(handle) && !site.hosts.includes(handle.toLowerCase())) {
    return `https://${site.defaultHost}/${handle}`;
  }

  // x.com/foo のようにスキームが無いものは https:// を補う。http:// は https:// にする。
  let candidate = value;
  if (/^http:\/\//i.test(candidate)) {
    candidate = `https://${candidate.slice('http://'.length)}`;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return value;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !site.hosts.includes(host)) return value;

  // 共有リンクに付く ?s=21 や #… は落とし、ユーザー名1つだけのときに寄せる
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) return value;
  const name = segments[0].startsWith('@') ? segments[0].slice(1) : segments[0];
  if (!name) return value;
  return `https://${host}/${name}`;
}
