/**
 * 都道府県名 → 図鑑サイト（data.pokefuta.com）の都道府県ページ URL。
 *
 * 写真館の `/manholes?q=<都道府県>` は、全件（482件・約700KB）をクライアントで
 * 取得してから部分一致で絞るだけの完全クライアント描画で、写真も1枚も出ない。
 * 図鑑側は同じ内容を47都道府県ぶん静的生成していて（マップ・現地写真・トリビア・
 * 一覧・ポケモン・近隣県）、リンクのラベル「ポケふた図鑑で◯◯を見る」とも一致する。
 * そのため詳細ページの都道府県リンクは図鑑へ直接送る。
 *
 * slug の正は pokefuta-tracker の `apps/scraper/prefectures.py`。
 * 図鑑は47都道府県すべてを生成済みなので、ここも47件そろえる。
 */

export const DEX_SITE_ORIGIN = 'https://data.pokefuta.com';

const PREFECTURE_SLUGS: Record<string, string> = {
  北海道: 'hokkaido', 青森県: 'aomori', 岩手県: 'iwate',
  宮城県: 'miyagi', 秋田県: 'akita', 山形県: 'yamagata',
  福島県: 'fukushima', 茨城県: 'ibaraki', 栃木県: 'tochigi',
  群馬県: 'gunma', 埼玉県: 'saitama', 千葉県: 'chiba',
  東京都: 'tokyo', 神奈川県: 'kanagawa', 新潟県: 'niigata',
  富山県: 'toyama', 石川県: 'ishikawa', 福井県: 'fukui',
  山梨県: 'yamanashi', 長野県: 'nagano', 岐阜県: 'gifu',
  静岡県: 'shizuoka', 愛知県: 'aichi', 三重県: 'mie',
  滋賀県: 'shiga', 京都府: 'kyoto', 大阪府: 'osaka',
  兵庫県: 'hyogo', 奈良県: 'nara', 和歌山県: 'wakayama',
  鳥取県: 'tottori', 島根県: 'shimane', 岡山県: 'okayama',
  広島県: 'hiroshima', 山口県: 'yamaguchi', 徳島県: 'tokushima',
  香川県: 'kagawa', 愛媛県: 'ehime', 高知県: 'kochi',
  福岡県: 'fukuoka', 佐賀県: 'saga', 長崎県: 'nagasaki',
  熊本県: 'kumamoto', 大分県: 'oita', 宮崎県: 'miyazaki',
  鹿児島県: 'kagoshima', 沖縄県: 'okinawa',
};

/** 図鑑の都道府県ページ URL。未知の都道府県名なら null（リンクを出さない）。 */
export function prefectureDexUrl(prefecture: string | null | undefined): string | null {
  const slug = prefecture ? PREFECTURE_SLUGS[prefecture] : undefined;
  return slug ? `${DEX_SITE_ORIGIN}/prefectures/${slug}/` : null;
}

/**
 * 図鑑の**同じ蓋**のページ URL。
 *
 * 図鑑側は蓋ページを写真館と同じマスター（tracker の `docs/pokefuta.ndjson`。
 * 写真館が読む `docs/api/manholes.json` と同じ起点）から全件生成しているので、
 * `/api/manholes` に出てくる id には必ず対応するページがある。
 *
 * 相互リンクは長らく片側通行だった。図鑑から写真館へは「写真を投稿」と
 * 「ポケふた写真館」の2本があるのに、写真館から図鑑の同じ蓋へ戻る線が無い。
 * 住所・ポケモンの解説・周辺情報を見たい人が、ブランドを跨いだ瞬間に迷子になる。
 *
 * 内部UTMは付けない（AGENTS.md）。ヘッダーのサイトスイッチャーや都道府県リンクと
 * 同じく素のURLで出し、計測はクロスドメインリンカーに任せる。
 */
export function manholeDexUrl(id: number | string | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  const normalized = String(id).trim();
  // id は数値のみ。想定外の値でURLを組み立てない
  if (!/^\d+$/.test(normalized)) return null;
  return `${DEX_SITE_ORIGIN}/manholes/${normalized}/`;
}
