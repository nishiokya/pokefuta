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

export type FeedCardTag =
  | 'fresh'
  | 'memory'
  | 'mythical'
  | 'legendary'
  | 'same-day'
  | 'pikachu'
  | 'regional'
  | 'night';

export type FeedCardTagInput = {
  id: string;
  manhole_id: number | null;
  shot_at: string;
  public_user_id?: string | null;
  manhole?: { pokemons?: string[] | null } | null;
};

const PIKACHU = new Set(['ピカチュウ', 'ライチュウ', 'アローラライチュウ', 'ピチュー']);

// 名前の頭に付く地方名。蓋の pokemons はフォーム名を「アローラナッシー」の形で持つ
const REGIONAL_PREFIXES = ['アローラ', 'ガラル', 'ヒスイ', 'パルデア'] as const;

/** 夜ふた: JST の 20:00〜4:59 に撮った写真（直近192件で17%） */
const NIGHT_START_HOUR = 20;
const NIGHT_END_HOUR = 5;

const ageMs = (value: string | null | undefined, now: number): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : now - t;
};

const JST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });
const JST_HOUR = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hourCycle: 'h23' });
const jstDate = (value: string): string | null => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : JST_DATE.format(d);
};

export function isNightShot(shotAt: string | null | undefined): boolean {
  if (!shotAt) return false;
  const d = new Date(shotAt);
  if (Number.isNaN(d.getTime())) return false;
  const hour = Number(JST_HOUR.format(d));
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/** 蓋に描かれたリージョンフォームの地方名（最初の1つ） */
export function regionalFormOf(pokemons: string[] | null | undefined): string | null {
  for (const p of pokemons ?? []) {
    const region = REGIONAL_PREFIXES.find((prefix) => p.startsWith(prefix) && p.length > prefix.length);
    if (region) return region;
  }
  return null;
}

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
    // 公開IDが無い投稿は数えない。内部の user_id（auth UID）に頼ると、公開APIがそれを返し
    // 続けることが前提になってしまう。公開IDが取れないときはチップが出ないだけで済ませる
    const who = v.public_user_id;
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
  if (visit.manhole?.pokemons?.some((p) => PIKACHU.has(p))) {
    chips.push({ tag: 'pikachu', label: 'ピカチュウ' });
  }
  const region = regionalFormOf(visit.manhole?.pokemons);
  if (region) chips.push({ tag: 'regional', label: `${region}のすがた` });
  if (isNightShot(visit.shot_at)) chips.push({ tag: 'night', label: '夜ふた' });
  if (isFreshShot(visit.shot_at, now)) chips.push({ tag: 'fresh', label: '撮れたて' });
  else if (isMemoryShot(visit.shot_at, now)) chips.push({ tag: 'memory', label: '思い出の1枚' });

  return chips.slice(0, MAX_CHIPS);
}

/** 同じ人の投稿をトップの1ページに何枚まで並べるか。超えた分は「ほか◯枚」の1枚に畳む */
export const MAX_CARDS_PER_POSTER = 6;

export type FeedCollapsed = {
  kind: 'collapsed';
  public_user_id: string;
  display_name: string | null;
  hidden: string[];
  /** 畳んだ分も含め、その人がこのページで1日に撮った蓋の最多枚数 */
  busiestDay: number;
};

/**
 * まとめ投稿で最新の投稿が1人に埋まらないよう、同じ人の7枚目以降を畳む。
 * 畳んだカードは7枚目があった位置に1枚だけ出す。公開IDの無い投稿は畳まない
 * （誰の投稿か言えないのでリンク先も作れない）。
 */
export function collapseByPoster<T extends FeedCardTagInput & { display_name?: string | null }>(
  visits: T[],
  maxPerPoster = MAX_CARDS_PER_POSTER
): Array<{ kind: 'visit'; visit: T } | FeedCollapsed> {
  const shown = new Map<string, number>();
  const collapsed = new Map<string, FeedCollapsed>();
  const dayCounts = new Map<string, Map<string, Set<number>>>();
  const out: Array<{ kind: 'visit'; visit: T } | FeedCollapsed> = [];

  for (const v of visits) {
    const who = v.public_user_id;
    if (!who) {
      out.push({ kind: 'visit', visit: v });
      continue;
    }
    const day = jstDate(v.shot_at);
    if (day && v.manhole_id != null) {
      if (!dayCounts.has(who)) dayCounts.set(who, new Map());
      const byDay = dayCounts.get(who)!;
      if (!byDay.has(day)) byDay.set(day, new Set());
      byDay.get(day)!.add(v.manhole_id);
    }
    const n = shown.get(who) ?? 0;
    if (n < maxPerPoster) {
      shown.set(who, n + 1);
      out.push({ kind: 'visit', visit: v });
      continue;
    }
    let group = collapsed.get(who);
    if (!group) {
      group = { kind: 'collapsed', public_user_id: who, display_name: v.display_name ?? null, hidden: [], busiestDay: 0 };
      collapsed.set(who, group);
      out.push(group);
    }
    group.hidden.push(v.id);
  }
  for (const [who, group] of collapsed) {
    group.busiestDay = Math.max(0, ...[...(dayCounts.get(who)?.values() ?? [])].map((s) => s.size));
  }
  return out;
}
