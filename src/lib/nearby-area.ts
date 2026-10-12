import { manholeLocationLabel, type ManholeLabelSource } from './manhole-label';
import { prefectureDexUrl } from './prefectureSlug';

/** 最寄りの蓋がこの距離より遠ければ「だいたい〇〇あたり」は出さない（自治体をまたいでいる見込みが高い） */
export const AREA_GUESS_MAX_KM = 10;
/** 図鑑リンクを並べる都道府県の数 */
export const DEX_LINK_MAX = 3;

export type NearbyAreaSource = ManholeLabelSource & { distance?: number };

export type NearbyArea = {
  /** 「愛知県名古屋」。最寄りの蓋の所在地から推定。遠ければ null */
  areaLabel: string | null;
  /** 近い順の都道府県と図鑑の URL。図鑑にページがある県だけ */
  prefectures: Array<{ name: string; dexUrl: string }>;
};

/**
 * 現在地のだいたいの都道府県・市区町村と、図鑑の都道府県ページへのリンク。
 *
 * 逆ジオコーディングはせず、近傍検索の結果（距離順）から推定する。
 * 県境の近くでは複数の県が並ぶので、近い順に最大 DEX_LINK_MAX 件出す。
 */
export function nearbyArea(manholes: NearbyAreaSource[]): NearbyArea {
  const sorted = manholes
    .filter((m) => typeof m.distance === 'number' && Number.isFinite(m.distance))
    .sort((a, b) => (a.distance as number) - (b.distance as number));

  const nearest = sorted[0];
  const areaLabel =
    nearest && (nearest.distance as number) <= AREA_GUESS_MAX_KM && nearest.prefecture
      ? manholeLocationLabel(nearest)
      : null;

  const prefectures: NearbyArea['prefectures'] = [];
  const seen = new Set<string>();
  for (const m of sorted) {
    if (prefectures.length >= DEX_LINK_MAX) break;
    if (!m.prefecture || seen.has(m.prefecture)) continue;
    seen.add(m.prefecture);
    const dexUrl = prefectureDexUrl(m.prefecture);
    if (dexUrl) prefectures.push({ name: m.prefecture, dexUrl });
  }

  return { areaLabel, prefectures };
}
