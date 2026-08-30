export type RankableManholePhoto = {
  id: string;
  created_at: string;
  score?: number | null;
  quality_score?: number | null;
  ranking_score?: number | null;
  visit?: {
    user_id?: string | null;
    is_public?: boolean;
    shot_at?: string | null;
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

/**
 * 並べ替えの基準時刻。撮影日(shot_at)が本命で、無ければアップロード日(created_at)に落とす。
 *
 * この2つは食い違う。8/11 に撮って 8/24 に上げた写真は created_at で並べると
 * 8/19 撮影の写真より新しい扱いになり、一覧の時系列が実際に破綻していた。
 *
 * どちらも読めない写真は MAX_SAFE_INTEGER にして末尾へ寄せる。0 を返すと
 * 「日付不明」が最古として先頭に居座り、古い順の一覧で目立ってしまう。
 */
export const photoChronologyTime = (photo: RankableManholePhoto) => {
  for (const raw of [photo.visit?.shot_at, photo.created_at]) {
    const time = raw ? new Date(raw).getTime() : NaN;
    if (Number.isFinite(time)) return time;
  }
  return Number.MAX_SAFE_INTEGER;
};

/**
 * 撮影日の古い順。蓋の詳細ページの「すべての写真」が、その蓋が撮られてきた
 * 記録として左上から読めるようにするための並び。
 *
 * 呼び出し側は拡大表示を元配列の添字で動かしているので、並べ替えても
 * 元の添字を `index` として持ち回る。同時刻は元の並びを保つ（安定化）。
 */
export const orderManholePhotosChronologically = <T extends RankableManholePhoto>(photos: T[]) =>
  photos
    .map((photo, index) => ({ photo, index }))
    .sort((a, b) => photoChronologyTime(a.photo) - photoChronologyTime(b.photo) || a.index - b.index);

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
