/**
 * 押した写真を蓋の詳細ページで先頭に出すためのリンク。
 *
 * 写真は `?photo=` ではなく `#photo-<id>` で渡す。`?photo=` は詳細ページの canonical と OGP を
 * 写真ごとに切り替える（共有用）ので、トップから大量に張ると同じ蓋が写真の数だけ別の URL に見える。
 * hash ならサーバにも検索にも届かない。
 */

const PHOTO_HASH_PREFIX = '#photo-';
const PHOTO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const manholePhotoHref = (manholeId: number | string, photoId?: string | null) => {
  const base = `/manhole/${manholeId}`;
  return photoId && PHOTO_ID_RE.test(photoId) ? `${base}${PHOTO_HASH_PREFIX}${photoId}` : base;
};

export const photoIdFromHash = (hash: string | null | undefined) => {
  if (!hash?.startsWith(PHOTO_HASH_PREFIX)) return null;
  const id = hash.slice(PHOTO_HASH_PREFIX.length);
  return PHOTO_ID_RE.test(id) ? id.toLowerCase() : null;
};
