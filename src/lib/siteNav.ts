import { SITE_NAME } from './constants';

/**
 * サイト共通クロム（ヘッダー／下タブ）のルート定義。
 *
 * ヘッダーは `layout.tsx` の SiteChrome が常時描画するので、ページ側は
 * 何も書かない。ページごとの差分（タイトル・アクティブタブ）はすべてここで持つ。
 *
 * 以前は各ページが `<Header title=... />` を手書きしていたため、20ページ中
 * 13ページが PC 用ナビを描き忘れて「PC なのにナビの無い SP ヘッダー」になっていた。
 * 追加漏れを構造的に起こさないためにこの表を唯一の入口にしている。
 */

export type NavKey = 'search' | 'stamp' | 'mytrip' | 'design';

export type RouteChrome = {
  /** SP ヘッダーに出すページタイトル */
  title: string;
  /** ナビでアクティブ表示にするタブ */
  activeNav?: NavKey;
  /** クロムを一切出さない（ログイン画面など、導線を断ちたいページ） */
  bare?: boolean;
};

/**
 * 前方一致で引く。より長いキーを優先するので、`/design-manholes/new` は
 * `/design-manholes` より先に一致する。
 */
const ROUTES: Record<string, RouteChrome> = {
  '/': { title: SITE_NAME },
  '/popular': { title: SITE_NAME },
  '/nearby': { title: 'ポケふたを探す', activeNav: 'search' },
  '/manhole': { title: 'ポケふた', activeNav: 'search' },
  '/manholes': { title: '全国ポケふた一覧', activeNav: 'search' },
  '/map': { title: 'ポケふたマップ', activeNav: 'search' },
  '/visits': { title: 'スタンプ帳', activeNav: 'stamp' },
  '/my-trip': { title: 'マイ旅', activeNav: 'mytrip' },
  '/upload': { title: '写真を投稿' },
  '/profile': { title: 'プロフィール' },
  '/about': { title: 'このアプリについて' },
  '/design-manholes': { title: 'デザインマンホール', activeNav: 'design' },
  '/design-manholes/new': { title: 'デザインマンホール投稿', activeNav: 'design' },
  '/p': { title: SITE_NAME },
  '/users': { title: SITE_NAME },

  // クロムを出さないページ
  '/login': { title: SITE_NAME, bare: true },
  '/api-docs': { title: SITE_NAME, bare: true },
};

const FALLBACK: RouteChrome = { title: SITE_NAME };

export function resolveChrome(pathname: string): RouteChrome {
  let best: RouteChrome | null = null;
  let bestLength = -1;

  for (const [prefix, chrome] of Object.entries(ROUTES)) {
    const matches = prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matches && prefix.length > bestLength) {
      best = chrome;
      bestLength = prefix.length;
    }
  }

  return best ?? FALLBACK;
}

/**
 * ナビ項目。PC の横ナビと SP の下タブで同じ定義を使う。
 *
 * ## 蓋の呼び方（ラベルを足すとき）
 *
 * ナビに収まる短縮形と、検索される正式名を **2層で使い分ける**。
 * 片方に寄せるとナビ幅か SEO のどちらかが壊れる。
 *
 * | 概念 | ナビ・タブ・フッターの**ラベル** | title / h1 / OGP / 本文の**概念名** |
 * |---|---|---|
 * | ガンダム等のキャラクター蓋 | キャラふた | キャラクターマンホール |
 * | ポケふた以外のご当地デザイン蓋 | デザインふた | デザインマンホール |
 *
 * ブランドが「ポケふた」なので短縮形はひらがなで揃える。中間形の
 * 「キャラマンホール」「キャラ蓋」「デザイン蓋」はラベルとしては使わない
 * （物理的な蓋を指す本文の言い回しは対象外）。
 * 投稿コレクション名「みんなのデザインマンホール」は固有名として維持する。
 * 図鑑側の同じ規約: pokefuta-tracker `docs/DEVELOPMENT.md`「用語（蓋の呼び分け）」。
 */
export type NavItem = { key: NavKey; label: string; href: string };

export const GUEST_NAV_ITEMS: NavItem[] = [
  { key: 'search', label: '探す', href: '/nearby' },
  { key: 'stamp', label: 'スタンプ帳', href: '/visits' },
];

export const AUTH_NAV_ITEMS: NavItem[] = [
  { key: 'search', label: '探す', href: '/nearby' },
  { key: 'stamp', label: 'スタンプ帳', href: '/visits' },
  { key: 'mytrip', label: 'マイ旅', href: '/my-trip' },
];
