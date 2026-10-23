/**
 * サイト共通クロム（ヘッダー／下タブ）のルート定義。
 *
 * ヘッダーは `layout.tsx` の SiteChrome が常時描画するので、ページ側は
 * 何も書かない。ページごとの差分（アクティブタブ・クロムを出さないページ）はすべてここで持つ。
 * SP ヘッダーの文字は図鑑と同じく「ポケふた｜写真館」で固定し、ページ名は出さない。
 *
 * 以前は各ページが `<Header title=... />` を手書きしていたため、20ページ中
 * 13ページが PC 用ナビを描き忘れて「PC なのにナビの無い SP ヘッダー」になっていた。
 * 追加漏れを構造的に起こさないためにこの表を唯一の入口にしている。
 */

export type NavKey = 'search' | 'stamp' | 'design';

export type RouteChrome = {
  /** ナビでアクティブ表示にするタブ */
  activeNav?: NavKey;
  /** クロムを一切出さない（ログイン画面など、導線を断ちたいページ） */
  bare?: boolean;
};

/**
 * 前方一致で引く（`/design-manholes/new` は `/design-manholes` に一致する）。
 * 複数のキーに一致したときは、より長いキーを優先する。
 * 表に無いページは FALLBACK（どのタブも光らせない）。
 */
const ROUTES: Record<string, RouteChrome> = {
  '/nearby': { activeNav: 'search' },
  '/manhole': { activeNav: 'search' },
  '/visits': { activeNav: 'stamp' },
  '/design-manholes': { activeNav: 'design' },

  // クロムを出さないページ
  '/login': { bare: true },
};

const FALLBACK: RouteChrome = {};

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

export function isSubmissionPage(pathname: string): boolean {
  return pathname === '/upload' || pathname === '/design-manholes/new';
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

// ログインの有無で項目は変わらない。以前はログイン後に「マイ旅」が増えていたが、
// スタンプ帳の「旅の記録」タブにまとめた（/my-trip は /visits?tab=trip へ転送）
export const NAV_ITEMS: NavItem[] = [
  { key: 'search', label: '探す', href: '/nearby' },
  { key: 'stamp', label: 'スタンプ帳', href: '/visits' },
];
