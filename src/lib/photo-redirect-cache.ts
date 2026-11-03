import { PHOTO_SIGNED_URL_TTL_SECONDS } from './constants';

/**
 * /api/photo/[id] の 307 を CDN（Amplify の CloudFront）に置いておく時間（秒）。
 *
 * 写真1枚ごとに SSR が1回動くので、ここが短いとサムネイルの多いページで起動回数が
 * 膨らむ（2026-11 時点で 1 PV あたり約15回、SSR 課金秒の6割弱。#282）。
 * 代わりに、公開 → 非公開に切り替えても、写真のURLを直接持っている人には
 * これ（＋下の署名URLの寿命）の間は見え続ける。一覧・詳細の API はキャッシュしないので、
 * ページからはすぐ消える。告知は PRIVATE_VISIBILITY_NOTICE とプライバシーポリシー。
 */
export const PUBLIC_PHOTO_CDN_MAX_AGE_SECONDS = 24 * 60 * 60;

/** ブラウザが同じ 307 を使い回す時間（秒）。共有キャッシュかどうかに関係なく短く保つ */
export const PHOTO_BROWSER_MAX_AGE_SECONDS = 300;

/**
 * 共有キャッシュに載せる 307 の転送先（署名URL）の寿命（秒）。
 * CDN に1日残った 307 をブラウザがさらに5分使い回しても切れないよう、両方の和より
 * 十分長くする。短いと、キャッシュに残った転送先が期限切れで画像が出なくなる。
 * R2 の署名URLの上限は7日。
 */
export const PUBLIC_PHOTO_SIGNED_URL_TTL_SECONDS = 2 * 24 * 60 * 60;

export type PhotoRedirectCachePolicy = {
  cacheControl: string;
  signedUrlTtlSeconds: number;
};

/**
 * 写真のリダイレクトに付ける Cache-Control と署名URLの寿命を決める。
 *
 * sharedCacheable は「公開写真で、かつクッキーを読んでいない」応答だけ true にする。
 * クッキーを読んだ応答には Set-Cookie が載りうるので共有キャッシュさせない（#275）。
 * 非公開写真は本人だけが見るので、短い寿命のまま private にする。
 */
export function photoRedirectCachePolicy(sharedCacheable: boolean): PhotoRedirectCachePolicy {
  if (sharedCacheable) {
    return {
      cacheControl: `public, max-age=${PHOTO_BROWSER_MAX_AGE_SECONDS}, s-maxage=${PUBLIC_PHOTO_CDN_MAX_AGE_SECONDS}`,
      signedUrlTtlSeconds: PUBLIC_PHOTO_SIGNED_URL_TTL_SECONDS,
    };
  }
  return {
    cacheControl: `private, max-age=${PHOTO_BROWSER_MAX_AGE_SECONDS}`,
    signedUrlTtlSeconds: PHOTO_SIGNED_URL_TTL_SECONDS,
  };
}
