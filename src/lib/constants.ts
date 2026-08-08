/**
 * サイト名。タブ・OGP・ヘッダーすべてこれを使う。
 *
 * 「スタンプ帳」はサイト名ではなく機能名（下タブの項目・図鑑からの導線ラベル）。
 * サイト名に昇格させると `写真館 > スタンプ帳` の入れ子が壊れ、
 * data.pokefuta.com（図鑑）とのサイト切替でも「調べる/撮る」の対比が立たないため
 * 2026-08-08 に「ポケふた写真館」へ統一した。
 */
export const SITE_NAME = 'ポケふた写真館';

/**
 * ブラウザタブのタイトル。サイト名の表記ゆれをここ1箇所に閉じる。
 *
 * クライアント側の `document.title` は以前ページごとに直書きされており、
 * 接尾辞が「ポケふた訪問記録」「ポケふたマップ」の2通りに割れていた。
 * GA4 は `page_title` に `document.title` を送るので、割れると計測も汚れる。
 */
export const pageTitle = (label: string) => `${label} | ${SITE_NAME}`;
export const SITE_URL = 'https://pokefuta.com';
export const OGP_IMAGE_VERSION = '20260522-ogp-layout';
export const OGP_IMAGE_URL = `${SITE_URL}/opengraph-image?v=${OGP_IMAGE_VERSION}`;

/**
 * 訪問写真を配信する署名URLの寿命（秒）。
 * 公開設定は PATCH /api/visits/[id] で後から変更できるため、これがそのまま
 * 「非公開に戻したのにまだ見える」最大時間になる。伸ばすときは注意すること。
 */
export const PHOTO_SIGNED_URL_TTL_SECONDS = 900;
