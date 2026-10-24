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
 * 説明ページで「集めがいのあるポケモン」として並べる最少の設置枚数。
 * ポケふたのポケモンの多くは1枚しかなく、1回の訪問でコンプリートになる。
 */
export const POKEMON_BADGE_MIN_MANHOLES = 5;

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

/** 設置枚数が POKEMON_BADGE_MIN_MANHOLES 以上のポケモンを、枚数の多い順に並べる */
export function buildPokemonBadges(
  manholes: readonly BadgeManhole[],
  visited: ReadonlySet<number> = new Set(),
): BadgeProgress[] {
  const counts = tally(manholes, visited, (m) => m.pokemons ?? []);
  return Array.from(counts.entries())
    .filter(([, count]) => count.total >= POKEMON_BADGE_MIN_MANHOLES)
    .map(([name, count]) => ({ name, ...count }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));
}


/** テーマ（スタンプ帳の「特徴」。蓋のハッシュタグ）ごとの枚数を、多い順に */
export function buildThemeBadges(
  manholes: readonly BadgeManhole[],
  visited: ReadonlySet<number> = new Set(),
): BadgeProgress[] {
  const counts = tally(manholes, visited, (m) => (m.hashtags ?? []).filter(Boolean));
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, ...count }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));
}
