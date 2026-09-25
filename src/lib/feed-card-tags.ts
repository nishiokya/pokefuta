/**
 * トップ「最新の投稿」カードに付けるタグ。
 *
 * 「撮れたて」「思い出」は撮影日で見る。写真は旅から帰ってからまとめて上げられるので
 * （投稿日と撮影日の差は中央値29日・平均177日）、投稿日で見ると1年前の写真が新しく見える。
 *
 * 投稿日で見る「NEW」は置かない。1ページ目の24枚が丸ごと48時間以内に収まる日があり、
 * 全カードに付いて目印にならなかった（2026-09-25 に本番データで確認）。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 撮影からこの日数内は「撮れたて」 */
export const FRESH_SHOT_DAYS = 7;
/** 撮影からこの日数以上たっていれば「思い出」 */
export const MEMORY_SHOT_DAYS = 365;

// 蓋に描かれているポケモンのうち伝説・幻（2026-09 時点の蓋482枚の pokemons から拾った）。
// 新しい蓋に伝説が来たらここに足す。載っていなければタグが付かないだけで壊れはしない。
const MYTHICAL = new Set([
  'ミュウ', 'セレビィ', 'ジラーチ', 'フィオネ', 'ビクティニ', 'メロエッタ', 'メルタン',
]);
const LEGENDARY = new Set([
  'ファイヤー', 'ライコウ', 'エンテイ', 'スイクン', 'ルギア', 'ホウオウ',
  'レジロック', 'レジアイス', 'レジスチル', 'レジギガス', 'ラティアス', 'ラティオス',
  'カイオーガ', 'レックウザ', 'ユクシー', 'エムリット', 'アグノム', 'ディアルガ',
  'パルキア', 'クレセリア', 'ビリジオン', 'ボルトロス', 'コスモッグ', 'ダクマ',
  'ウーラオス', 'オーガポン',
]);

export type FeedCardTag = 'fresh' | 'memory' | 'mythical' | 'legendary' | 'same-day';

export type FeedCardTagInput = {
  id: string;
  manhole_id: number | null;
  shot_at: string;
  user_id?: string | null;
  public_user_id?: string | null;
  manhole?: { pokemons?: string[] | null } | null;
};

const ageMs = (value: string | null | undefined, now: number): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : now - t;
};

const JST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });
const jstDate = (value: string): string | null => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : JST_DATE.format(d);
};

export function isFreshShot(shotAt: string | null | undefined, now = Date.now()): boolean {
  const age = ageMs(shotAt, now);
  // 片側を開けたままにすると、カメラの日付設定を誤った1枚に未来永劫付き続けるので両側で切る
  return age !== null && Math.abs(age) < FRESH_SHOT_DAYS * DAY_MS;
}

export function isMemoryShot(shotAt: string | null | undefined, now = Date.now()): boolean {
  const age = ageMs(shotAt, now);
  return age !== null && age >= MEMORY_SHOT_DAYS * DAY_MS;
}

export function rarityOf(pokemons: string[] | null | undefined): 'mythical' | 'legendary' | null {
  if (!pokemons?.length) return null;
  if (pokemons.some((p) => MYTHICAL.has(p))) return 'mythical';
  if (pokemons.some((p) => LEGENDARY.has(p))) return 'legendary';
  return null;
}

/**
 * 同じ蓋を同じ日（JST）に撮った人数。表示中のページ内だけで数える
 * （ページをまたぐ重なりは拾えないが、同じ日の投稿はたいてい並んで上がる）。
 */
export function sameDayVisitorCounts(visits: FeedCardTagInput[]): Map<string, number> {
  const people = new Map<string, Set<string>>();
  const keyOf = new Map<string, string>();
  for (const v of visits) {
    const day = jstDate(v.shot_at);
    const who = v.public_user_id ?? v.user_id;
    if (v.manhole_id == null || !day || !who) continue;
    const key = `${v.manhole_id}:${day}`;
    keyOf.set(v.id, key);
    if (!people.has(key)) people.set(key, new Set());
    people.get(key)!.add(who);
  }
  const result = new Map<string, number>();
  for (const [id, key] of keyOf) {
    const n = people.get(key)!.size;
    if (n >= 2) result.set(id, n);
  }
  return result;
}

/** 写真下の帯に並べるチップ。多すぎると写真が隠れるので最大2つ */
export type FeedCardChip = { tag: FeedCardTag; label: string };

export const MAX_CHIPS = 2;

export function feedCardTags(
  visit: FeedCardTagInput,
  sameDayCount: number | undefined,
  now = Date.now()
): FeedCardChip[] {
  const chips: FeedCardChip[] = [];
  // 並び順＝優先度。珍しいものから
  const rarity = rarityOf(visit.manhole?.pokemons);
  if (rarity === 'mythical') chips.push({ tag: 'mythical', label: '幻' });
  if (rarity === 'legendary') chips.push({ tag: 'legendary', label: '伝説' });
  if (sameDayCount && sameDayCount >= 2) {
    chips.push({ tag: 'same-day', label: `同じ日に${sameDayCount}人` });
  }
  if (isFreshShot(visit.shot_at, now)) chips.push({ tag: 'fresh', label: '撮れたて' });
  else if (isMemoryShot(visit.shot_at, now)) chips.push({ tag: 'memory', label: '思い出の1枚' });

  return chips.slice(0, MAX_CHIPS);
}
