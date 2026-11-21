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

/**
 * 代表写真は蓋の id を 100 枚ずつの固定の区切り（バケツ）で取る。
 * 以前は見ている人ごとに違う id の組み合わせを `?ids=` で渡していたので、CDN のキャッシュが
 * ほとんど当たらず、毎回 DB まで来ていた（2026-11 時点で DB 時間の約4割）。区切りを固定すると
 * URL が数本に収まり、CDN で共有できる。
 */
export const COVER_PHOTO_BUCKET_SIZE = 100;

/** 蓋 id が入るバケツ番号（0 始まり）。id 1〜100 → 0、101〜200 → 1 */
export const coverPhotoBucketOf = (manholeId: number) =>
  Math.floor((manholeId - 1) / COVER_PHOTO_BUCKET_SIZE);

/** バケツが受け持つ蓋 id の範囲（両端を含む） */
export const coverPhotoBucketRange = (bucket: number) => ({
  from: bucket * COVER_PHOTO_BUCKET_SIZE + 1,
  to: (bucket + 1) * COVER_PHOTO_BUCKET_SIZE,
});

/** 蓋 id の並びから、取りに行くバケツ番号を重複なしで返す（不正な id は捨てる） */
export const coverPhotoBucketsFor = (manholeIds: number[]) =>
  Array.from(
    new Set(
      manholeIds
        .filter((id) => Number.isInteger(id) && id > 0)
        .map(coverPhotoBucketOf)
    )
  ).sort((a, b) => a - b);

/**
 * DB から読んだ行（ai_tags は必要なキーだけを別名で取る）を、選び方の関数が読む形に戻す。
 * ai_tags は丸ごと読むと行が重い（DB の転送量に効く）ので、使うキーだけを取る:
 * scene・lid_fits・rep_score（rankManholePhotos）と lid・crop（lidCropOf）。
 */
export type CoverPhotoRow = {
  id: string;
  manhole_id: number | null;
  created_at: string;
  quality_score: number | null;
  quality_eligible: boolean | null;
  is_landscape: boolean | null;
  ai_scene: unknown;
  ai_lid_fits: unknown;
  ai_rep_score: unknown;
  ai_lid: unknown;
  ai_crop: unknown;
};

export function coverPhotoCandidateFromRow(row: CoverPhotoRow): CoverPhotoCandidate {
  const tags: Record<string, unknown> = {};
  if (row.ai_scene != null) tags.scene = row.ai_scene;
  if (row.ai_lid_fits != null) tags.lid_fits = row.ai_lid_fits;
  if (row.ai_rep_score != null) tags.rep_score = row.ai_rep_score;
  if (row.ai_lid != null) tags.lid = row.ai_lid;
  if (row.ai_crop != null) tags.crop = row.ai_crop;
  return {
    id: row.id,
    manhole_id: row.manhole_id,
    created_at: row.created_at,
    quality_score: row.quality_score,
    quality_eligible: row.quality_eligible,
    is_landscape: Boolean(row.is_landscape),
    ai_tags: Object.keys(tags).length > 0 ? tags : null,
  };
}

const lidCropOf =(aiTags: unknown): CoverPhoto['lid_crop'] => {
  if (typeof aiTags !== 'object' || aiTags === null || Array.isArray(aiTags)) return null;
  const { lid, crop } = aiTags as { lid?: unknown; crop?: unknown };
  return lid === undefined && crop === undefined ? null : { lid, crop };
};

/**
 * 蓋ごとに代表写真を1枚選ぶ。並びは詳細ページの代表写真と同じ rankManholePhotos
 * （風景は後ろ。風景しか無い蓋は風景を出す）。ただし、ひとこと付きを先にする決まりは外す。
 * 丸い切り抜きには吹き出しが出ないので、ひとことを優先しても見る人には何も増えない。
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
    const [best] = rankManholePhotos(list, { preferCommented: false });
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
