/**
 * /badges（バッジの説明）に並べる都道府県・ポケモン・テーマの一覧を、蓋の一覧から組み立てる。
 * 画面に依存しない純粋な関数だけを置く。訪問済みを渡すと進み具合も数える。
 */

export type BadgeManhole = {
  id: number;
  prefecture: string | null;
  pokemons: string[] | null;
  hashtags?: string[] | null;
};

export type BadgeProgress = {
  name: string;
  total: number;
  visited: number;
};

export type RegionBadges = {
  region: string;
  prefectures: BadgeProgress[];
};

/**
 * バッジのメダルの段。2026-10-25 に、都道府県・ポケモンとも「その中で何割回ったか」の3段にした
 * （それまでは都道府県が県の枚数で金銀銅、ポケモンは3枚以上の種類だけで、スタンプの一覧と見分けがつかなかった）。
 * 全部で金、2/3 で銀、1/3 で銅。端数は切り捨て、少なくとも1枚。
 */
export type BadgeRank = 'gold' | 'silver' | 'bronze';

export function badgeRankThresholds(total: number): Record<BadgeRank, number> {
  return {
    bronze: Math.max(1, Math.floor(total / 3)),
    silver: Math.max(1, Math.floor((total * 2) / 3)),
    gold: total,
  };
}

/** まだ銅に届かなければ null */
export function badgeRank(visited: number, total: number): BadgeRank | null {
  if (total <= 0 || visited <= 0) return null;
  const t = badgeRankThresholds(total);
  if (visited >= t.gold) return 'gold';
  if (visited >= t.silver) return 'silver';
  if (visited >= t.bronze) return 'bronze';
  return null;
}

/** 図鑑の地方の分け方と同じ6地方 */
export const BADGE_REGIONS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['北海道・東北', ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県']],
  ['関東', ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県']],
  ['中部', ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県']],
  ['近畿', ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県']],
  ['中国・四国', ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県']],
  ['九州・沖縄', ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']],
];

const tally = (
  manholes: readonly BadgeManhole[],
  visited: ReadonlySet<number>,
  keysOf: (manhole: BadgeManhole) => readonly string[],
) => {
  const counts = new Map<string, { total: number; visited: number }>();
  for (const manhole of manholes) {
    // 1枚に同じポケモンが2回書かれていても1枚と数える
    for (const key of new Set(keysOf(manhole))) {
      const current = counts.get(key) ?? { total: 0, visited: 0 };
      current.total += 1;
      if (visited.has(manhole.id)) current.visited += 1;
      counts.set(key, current);
    }
  }
  return counts;
};

/** 設置のある都道府県だけを、6地方ごとに北から並べる（未設置の県はバッジにしない） */
export function buildPrefectureBadges(
  manholes: readonly BadgeManhole[],
  visited: ReadonlySet<number> = new Set(),
): RegionBadges[] {
  const counts = tally(manholes, visited, (m) => (m.prefecture ? [m.prefecture] : []));
  return BADGE_REGIONS.map(([region, prefectures]) => ({
    region,
    prefectures: prefectures
      .filter((name) => counts.has(name))
      .map((name) => ({ name, ...counts.get(name)! })),
  })).filter((group) => group.prefectures.length > 0);
}

/** ポケふたに描かれている全ポケモンを、枚数の多い順に並べる */
export function buildPokemonBadges(
  manholes: readonly BadgeManhole[],
  visited: ReadonlySet<number> = new Set(),
): BadgeProgress[] {
  const counts = tally(manholes, visited, (m) => m.pokemons ?? []);
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, ...count }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));
}


/**
 * ステッカー。対象の蓋を1枚でも訪問すればもらえる（全部集めるバッジと分けて、難易度を下げてある）。
 * テーマ（蓋のハッシュタグ）は37種類あるが、ほとんどの蓋に付く大きなテーマは印にならないので、
 * 2026-10-24 にガンダムと東西南北の端だけに絞った。最南と最西は同じ1枚。
 */
/** バッジの並び。訪問した枚数の多い順、同じなら全部の枚数の多い順（大きい県・ポケモンを先に） */
export const byCollected = <T extends { name: string; visited: number; total: number }>(a: T, b: T) =>
  b.visited - a.visited || b.total - a.total || a.name.localeCompare(b.name, 'ja');

export type ThemeBadgeDef = {
  key: string;
  icon: string;
  name: string;
  description: string;
  tag: string;
};

export const THEME_BADGES: readonly ThemeBadgeDef[] = [
  { key: 'gundam', icon: '🤖', name: 'ガンダムのまち', description: 'ガンダムマンホールのある町のポケふたを1枚訪問', tag: '#ガンダムマンホールのあるまち' },
  { key: 'north', icon: '⬆️', name: '日本最北', description: '日本でいちばん北のポケふたを訪問', tag: '#日本最北のポケふた' },
  { key: 'south', icon: '⬇️', name: '日本最南', description: '日本でいちばん南のポケふたを訪問', tag: '#日本最南のポケふた' },
  { key: 'east', icon: '➡️', name: '日本最東', description: '日本でいちばん東のポケふたを訪問', tag: '#日本最東のポケふた' },
  { key: 'west', icon: '⬅️', name: '日本最西', description: '日本でいちばん西のポケふたを訪問', tag: '#日本最西のポケふた' },
];

export type ThemeBadgeProgress = ThemeBadgeDef & {
  /** そのテーマの蓋の枚数 */
  total: number;
  visited: number;
  earned: boolean;
};

/** ステッカー。対象の蓋を1枚でも訪問すればもらえる */
export function buildThemeBadges(
  manholes: readonly BadgeManhole[],
  visited: ReadonlySet<number> = new Set(),
): ThemeBadgeProgress[] {
  return THEME_BADGES.map((def) => {
    const ids = manholes.filter((m) => (m.hashtags ?? []).includes(def.tag)).map((m) => m.id);
    const visitedCount = ids.filter((id) => visited.has(id)).length;
    return { ...def, total: ids.length, visited: visitedCount, earned: visitedCount > 0 };
  }).filter((badge) => badge.total > 0);
}

/**
 * ポケモンバッジのメダルに入れる蓋。代表マンホール（dataset/pokemon_representatives.json）が
 * そのポケモンの蓋の中にあればそれ、無ければ id の小さい蓋。
 */
export function pokemonBadgeManholeIds(
  manholes: readonly BadgeManhole[],
  representatives: ReadonlyMap<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  const idsByPokemon = new Map<string, number[]>();
  for (const manhole of manholes) {
    for (const name of new Set(manhole.pokemons ?? [])) {
      idsByPokemon.set(name, [...(idsByPokemon.get(name) ?? []), manhole.id]);
    }
  }
  idsByPokemon.forEach((ids, name) => {
    const rep = representatives.get(name);
    result.set(name, rep !== undefined && ids.includes(rep) ? rep : Math.min(...ids));
  });
  return result;
}

/** 図鑑が作っている蓋の切り抜き画像（投稿写真から蓋の枠で切ったもの） */
export const lidImageUrl = (manholeId: number) => `https://data.pokefuta.com/manhole/image/${manholeId}_lid.jpeg`;
