export const SITE_NAME = 'ポケふたスタンプ帳';
export const SITE_URL = 'https://pokefuta.com';
export const OGP_IMAGE_VERSION = '20260522-ogp-layout';
export const OGP_IMAGE_URL = `${SITE_URL}/opengraph-image?v=${OGP_IMAGE_VERSION}`;

/**
 * 訪問写真を配信する署名URLの寿命（秒）。
 * 公開設定は PATCH /api/visits/[id] で後から変更できるため、これがそのまま
 * 「非公開に戻したのにまだ見える」最大時間になる。伸ばすときは注意すること。
 */
export const PHOTO_SIGNED_URL_TTL_SECONDS = 900;
