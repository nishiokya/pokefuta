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

/**
 * URL のセグメントを蓋のidとして受け取る。**サーバ描画と単体GETで同じ判定を使う。**
 *
 * `Number()` に任せると `/manhole/82.0` や `/manhole/0x52`（16進で82）が
 * 黙って 82 になる。サーバ描画は中身を出すのに単体GETは 400 を返すので、
 * 偽のURLで本文だけが出る状態になっていた（PR #247 で Codex が指摘）。
 *
 * id は 1 始まりなので `0` も弾く。
 */
export const parseManholeIdParam = (raw: string | undefined | null): number | null => {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 ? id : null;
};

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
  // **並びをここで確定させる。** 旧実装は `/api/manholes` が返す id 降順のリストを
  // slice していた（route.ts の `sort((a, b) => b.id - a.id)`）。スナップショットは
  // 今のところ生成側が `order=id.desc` で書き出しているので同じ順になるが、それは
  // 上流の設定に依存しているだけで、変われば「同じポケモンのポケふた」に出る10件が
  // 黙って入れ替わる。ここで並べ直して、入力の順序に依存しないようにする。
  const others = allManholes
    .filter((m) => m.id !== manhole.id)
    .sort((a, b) => b.id - a.id);

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
          // 同じ距離の蓋が並んだときも順序が揺れないよう id を第2キーにする
          .sort((a, b) => a.distanceKm - b.distanceKm || b.id - a.id)
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
