/**
 * 詳細ページ1枚ぶんの派生値を組み立てる。
 *
 * ここが `/api/manholes/[id]` の中身。詳細ページはこれだけを受け取り、
 * **全482件（730KB）の取得をやめる**。以前はクライアントが `/api/manholes` で
 * 全件を落としてから `find` で1件を探し、近傍・同じポケモン・統計もその場で
 * 計算していた。1枚見るために全国分を運んでいた。
 *
 * フェーズ4で tracker が `docs/api/manholes.json` に同じ値を焼き込んだら、
 * ここは**焼き込まれた値を読むだけ**に痩せる。逆に、焼き込みを先にやると
 * 全件JSONが 730KB → 1.67MB に膨らみ、全件取得のままのクライアントに
 * そのまま跳ね返る。だからこちらが先。
 *
 * 件数の上限は図鑑（pokefuta-tracker の `generate_manhole_pages.py`）に合わせる。
 */

import { calculateDistance } from '@/lib/location';
import { filterPokemons, manholeLabel } from '@/lib/manhole-label';
import {
  NEARBY_RADIUS_KM,
  buildStatBadges,
  computeManholeStats,
  type ManholeStats,
  type StatBadge,
} from '@/lib/manhole-stats';
import type { ManholeTitle } from '@/types/database';

/** 図鑑の「次に寄れるポケふた」と同じ件数。 */
export const NEARBY_LIMIT = 5;
/** 図鑑の「同じポケモンのポケふた」と同じ件数。写真館は6件だったので図鑑に寄せる。 */
export const SAME_POKEMON_LIMIT = 10;

type DetailSource = {
  id: number;
  prefecture?: string | null;
  city?: string | null;
  municipality?: string | null;
  pokemons?: string[] | null;
  title?: string | null;
  titles?: ManholeTitle[] | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * 関連カード1枚。**ラベルはサーバで組み立てて渡す。**
 * 相手の蓋の行をまるごと送ると、1枚のページのために15件ぶんの全列を運ぶことになる。
 */
export type RelatedManhole = {
  id: number;
  label: string;
  /** 近傍のみ。km、小数1桁に丸める前の生値。 */
  distanceKm?: number;
};

export type ManholeDetailDerived = {
  stats: ManholeStats;
  statBadges: StatBadge[];
  nearby: RelatedManhole[];
  samePokemon: RelatedManhole[];
};

export function buildManholeDetail(
  manhole: DetailSource,
  allManholes: DetailSource[]
): ManholeDetailDerived {
  const others = allManholes.filter((m) => m.id !== manhole.id);

  const nearby: RelatedManhole[] =
    manhole.latitude != null && manhole.longitude != null
      ? others
          .filter((m) => m.latitude != null && m.longitude != null)
          .map((m) => ({
            id: m.id,
            label: manholeLabel(m),
            distanceKm: calculateDistance(
              manhole.latitude!,
              manhole.longitude!,
              m.latitude!,
              m.longitude!
            ),
          }))
          .filter((e) => e.distanceKm <= NEARBY_RADIUS_KM)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, NEARBY_LIMIT)
      : [];

  const pokemonSet = new Set(filterPokemons(manhole.pokemons));
  const samePokemon: RelatedManhole[] =
    pokemonSet.size > 0
      ? others
          .filter((m) => filterPokemons(m.pokemons).some((p) => pokemonSet.has(p)))
          .slice(0, SAME_POKEMON_LIMIT)
          .map((m) => ({ id: m.id, label: manholeLabel(m) }))
      : [];

  const stats = computeManholeStats(manhole, allManholes);

  return {
    stats,
    statBadges: buildStatBadges(manhole, stats, manhole.titles),
    nearby,
    samePokemon,
  };
}
