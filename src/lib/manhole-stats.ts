/**
 * 蓋の統計バッジと公式サイトへのリンク。**図鑑（data.pokefuta.com）と同じ規則をここに1本化する。**
 *
 * 図鑑側の正は pokefuta-tracker の `apps/scraper/generate_manhole_pages.py`
 * （`generate_all_pages()` の集計と、HERO カードの「Stats badges with suppression rules」）。
 *
 * フェーズ4でこれらの派生値をスナップショットへ焼き込む予定なので、そのときは
 * この計算を消して**焼き込まれた値を読むだけ**にする。ここはその前段。
 */

import { filterPokemons } from '@/lib/manhole-label';
import { calculateDistance } from '@/lib/location';
import type { ManholeTitle } from '@/types/database';

/** 図鑑の近傍集計と同じ半径。「30km以内にN件」の N はこの範囲で数える。 */
export const NEARBY_RADIUS_KM = 30;

/** 公式情報の唯一の配信元。ここ以外のURLはリンクにしない。 */
const OFFICIAL_HOST = 'local.pokemon.jp';

type StatsSource = {
  id: number;
  prefecture?: string | null;
  city?: string | null;
  municipality?: string | null;
  pokemons?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ManholeStats = {
  /** 同じ都道府県の枚数。**自分を含む。** */
  prefTotal: number;
  /** 同じ市区町村の枚数。**自分を含む。** */
  cityTotal: number;
  /** ポケモンが1匹でも重なる**他の**蓋の枚数。 */
  samePokemonTotal: number;
  /** 30km以内にある**他の**蓋の件数。 */
  nearbyCount: number;
};

export type StatBadge = { key: string; label: string };

const cityOf = (m: { city?: string | null; municipality?: string | null }) =>
  m.city || m.municipality || '';

export function computeManholeStats(
  manhole: StatsSource,
  allManholes: StatsSource[]
): ManholeStats {
  const prefecture = manhole.prefecture ?? '';
  const city = cityOf(manhole);
  const others = allManholes.filter((m) => m.id !== manhole.id);

  const prefTotal = prefecture
    ? allManholes.filter((m) => m.prefecture === prefecture).length
    : 0;

  const cityTotal =
    prefecture && city
      ? allManholes.filter((m) => m.prefecture === prefecture && cityOf(m) === city).length
      : 0;

  const pokemonSet = new Set(filterPokemons(manhole.pokemons));
  const samePokemonTotal =
    pokemonSet.size > 0
      ? others.filter((m) => filterPokemons(m.pokemons).some((p) => pokemonSet.has(p))).length
      : 0;

  const nearbyCount =
    manhole.latitude != null && manhole.longitude != null
      ? others.filter(
          (m) =>
            m.latitude != null &&
            m.longitude != null &&
            calculateDistance(manhole.latitude!, manhole.longitude!, m.latitude, m.longitude) <=
              NEARBY_RADIUS_KM
        ).length
      : 0;

  return { prefTotal, cityTotal, samePokemonTotal, nearbyCount };
}

/**
 * 表示する統計バッジ。称号と内容が重複するものは出さない（図鑑の抑制規則 §2.3）。
 *
 * - `only_in_pref` / `unique_pokemon` が付いていれば「{県} N枚」は出さない
 *   — 称号が既に希少さを言っており、枚数を並べると打ち消して見える
 * - `lone` が付いていれば「30km以内にN件」は出さない — 孤立が売りの蓋なので
 * - 市区町村は**2枚以上あるときだけ**出す。1枚なら情報が無い
 */
export function buildStatBadges(
  manhole: { prefecture?: string | null; city?: string | null; municipality?: string | null },
  stats: ManholeStats,
  titles?: ManholeTitle[] | null
): StatBadge[] {
  const titleKeys = new Set((Array.isArray(titles) ? titles : []).map((t) => t.key));
  const suppressPref = titleKeys.has('only_in_pref') || titleKeys.has('unique_pokemon');
  const suppressNearby = titleKeys.has('lone');

  const prefecture = manhole.prefecture ?? '';
  const city = cityOf(manhole);
  const badges: StatBadge[] = [];

  if (stats.prefTotal > 0 && prefecture && !suppressPref) {
    badges.push({ key: 'pref', label: `${prefecture} ${stats.prefTotal}枚` });
  }
  if (stats.cityTotal >= 2 && city) {
    badges.push({ key: 'city', label: `${city} ${stats.cityTotal}枚` });
  }
  if (stats.samePokemonTotal > 0) {
    badges.push({ key: 'same-pokemon', label: `同じポケモン ${stats.samePokemonTotal}枚` });
  }
  if (stats.nearbyCount > 0 && !suppressNearby) {
    badges.push({ key: 'nearby', label: `${NEARBY_RADIUS_KM}km以内に${stats.nearbyCount}件` });
  }
  return badges;
}

/**
 * 公式サイトのURLを検証して返す。**`https://local.pokemon.jp` 以外は `null`。**
 *
 * スクレイプ由来の値なので、そのままリンクにしない。実際 `official_url` には
 * 相対パス `/municipality/nagasaki/` が入っている行が5枚ある（長崎県の一部）。
 * 図鑑も同じ条件（scheme=https かつ hostname=local.pokemon.jp）で弾いている。
 */
export function officialUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === OFFICIAL_HOST ? url.toString() : null;
  } catch {
    // 相対パスなど URL として解釈できない値
    return null;
  }
}

/**
 * 詳細ページに出す公式リンク。**同じURLを2本出さない。**
 *
 * `official_url`（自治体ページのつもりの列）には、蓋の詳細ページと同じURLが
 * 入っている行が**482枚中154枚**ある。そのまま2本並べると、行き先が同じなのに
 * 2本目だけ「{県}のページ」と名乗る、ラベルが嘘のリンクになる。
 * 列の意味ではなく**実際のURL**で重複を判定する。
 */
export function officialLinks(manhole: {
  detail_url?: string | null;
  official_url?: string | null;
}): { detail: string | null; prefecture: string | null } {
  const detail = officialUrl(manhole.detail_url);
  const prefecture = officialUrl(manhole.official_url);
  return {
    detail,
    prefecture: prefecture && prefecture !== detail ? prefecture : null,
  };
}
