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
/**
 * OGP 画像のキャッシュキー。**画像の中身を変えたら必ず更新すること。**
 * URL が変わらないと SNS のクローラが古い画像を配り続ける。
 * 20260808: 画像に焼いていたサイト名を「ポケふた写真館」に変更したため更新
 */
export const OGP_IMAGE_VERSION = '20260808-site-name';
export const OGP_IMAGE_URL = `${SITE_URL}/opengraph-image?v=${OGP_IMAGE_VERSION}`;

/**
 * 進捗の分母をデータ取得前に出すときだけ使うフォールバック。**正は常に DB / API の実数。**
 *
 * ⚠️ 都道府県の分母に 47 を使ってはいけない。ポケふたは47都道府県のうち42県にしか
 * 設置されておらず（群馬・山梨・広島・熊本・大分が0枚）、47を分母にすると
 * 誰も100%に到達できない。
 */
export const FALLBACK_INSTALLED_PREFECTURE_COUNT = 42;
export const FALLBACK_TOTAL_MANHOLE_COUNT = 482;

/** prefecture が空のマンホールをまとめる先。分母から除外する対象でもある */
export const UNKNOWN_PREFECTURE = '都道府県未設定';

/**
 * 訪問写真を配信する署名URLの寿命（秒）。
 * 公開設定は PATCH /api/visits/[id] で後から変更できるため、これがそのまま
 * 「非公開に戻したのにまだ見える」最大時間になる。伸ばすときは注意すること。
 */
export const PHOTO_SIGNED_URL_TTL_SECONDS = 900;
