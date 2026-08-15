export type RankableManholePhoto = {
  id: string;
  created_at: string;
  score?: number | null;
  quality_score?: number | null;
  ranking_score?: number | null;
  visit?: {
    user_id?: string | null;
    is_public?: boolean;
  } | null;
};

export const getManholePhotoScore = (photo: RankableManholePhoto) => {
  const candidates = [photo.score, photo.quality_score, photo.ranking_score];
  return candidates.find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  ) ?? null;
};

export const rankManholePhotos = <T extends RankableManholePhoto>(items: T[]) =>
  [...items].sort((a, b) => {
    const aScore = getManholePhotoScore(a);
    const bScore = getManholePhotoScore(b);

    if (aScore !== null || bScore !== null) {
      if (aScore === null) return 1;
      if (bScore === null) return -1;
      if (aScore !== bScore) return bScore - aScore;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

export const orderManholePhotosForViewer = <T extends RankableManholePhoto>(
  photos: T[],
  currentUserId: string | null
) => {
  const myPhotos = currentUserId
    ? rankManholePhotos(photos.filter((photo) => photo.visit?.user_id === currentUserId))
    : [];
  const visiblePhotos = rankManholePhotos(
    photos.filter(
      (photo) => photo.visit?.is_public === true || photo.visit?.user_id === currentUserId
    )
  );
  const representativePhoto = myPhotos[0] ?? visiblePhotos[0] ?? null;
  const orderedPhotos = representativePhoto
    ? [representativePhoto, ...visiblePhotos.filter((photo) => photo.id !== representativePhoto.id)]
    : [];

  return { myPhotos, orderedPhotos, representativePhoto };
};
