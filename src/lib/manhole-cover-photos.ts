import { rankManholePhotos, type RankableManholePhoto } from './manhole-photo-ranking';

export type CoverPhotoCandidate = RankableManholePhoto & {
  manhole_id: number | null;
};

export type CoverPhoto = {
  photo_id: string;
  /** 一覧のサムネは小サイズ。原寸は1枚1.5MB級で、数十枚並べると読み込みが終わらない */
  thumbnail_url: string;
  is_landscape: boolean;
  /** 丸に蓋を切り抜く位置（ai_tags の lid・crop だけ。StampPhoto に渡す）。採点前の写真は null */
  lid_crop: { lid?: unknown; crop?: unknown } | null;
};

const lidCropOf = (aiTags: unknown): CoverPhoto['lid_crop'] => {
  if (typeof aiTags !== 'object' || aiTags === null || Array.isArray(aiTags)) return null;
  const { lid, crop } = aiTags as { lid?: unknown; crop?: unknown };
  return lid === undefined && crop === undefined ? null : { lid, crop };
};

/**
 * 蓋ごとに代表写真を1枚選ぶ。並びは詳細ページの代表写真と同じ rankManholePhotos
 * （風景は後ろ。風景しか無い蓋は風景を出す）。
 */
export function pickCoverPhotos(photos: CoverPhotoCandidate[]): Record<string, CoverPhoto> {
  const byManhole = new Map<number, CoverPhotoCandidate[]>();
  for (const photo of photos) {
    if (!photo.manhole_id) continue;
    const list = byManhole.get(photo.manhole_id) ?? [];
    list.push(photo);
    byManhole.set(photo.manhole_id, list);
  }

  const result: Record<string, CoverPhoto> = {};
  for (const [manholeId, list] of byManhole) {
    const [best] = rankManholePhotos(list);
    if (!best) continue;
    result[String(manholeId)] = {
      photo_id: best.id,
      thumbnail_url: `/api/photo/${best.id}?size=small`,
      is_landscape: Boolean(best.is_landscape),
      lid_crop: lidCropOf(best.ai_tags),
    };
  }
  return result;
}
