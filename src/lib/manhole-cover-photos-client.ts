import { coverPhotoBucketOf, coverPhotoBucketsFor, type CoverPhoto } from './manhole-cover-photos';

type CoverPhotoMap = Record<string, CoverPhoto>;

/**
 * 取りに行ったバケツの結果をページ内で持つ。打つたびに候補が変わる /upload でも、
 * 同じバケツは期限内なら1回しか取りに行かない。期限は API のブラウザ側 max-age（1時間）に合わせる。
 * 失敗したバケツは捨てて、次に頼まれたときに取り直す。
 */
const BUCKET_TTL_MS = 60 * 60 * 1000;
const bucketCache = new Map<number, { request: Promise<CoverPhotoMap>; fetchedAt: number }>();

const fetchBucket = (bucket: number): Promise<CoverPhotoMap> => {
  const cached = bucketCache.get(bucket);
  if (cached && Date.now() - cached.fetchedAt < BUCKET_TTL_MS) return cached.request;
  const request = fetch(`/api/manholes/cover-photos?bucket=${bucket}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`cover-photos bucket ${bucket}: HTTP ${response.status}`);
      const data = (await response.json()) as { success?: boolean; photos?: CoverPhotoMap };
      if (!data.success) throw new Error(`cover-photos bucket ${bucket}: not success`);
      return data.photos ?? {};
    })
    .catch((error: unknown) => {
      bucketCache.delete(bucket);
      throw error;
    });
  bucketCache.set(bucket, { request, fetchedAt: Date.now() });
  return request;
};

export type CoverPhotosResult = {
  /** 代表写真（キーは蓋 id の文字列）。写真が無い蓋は入らない */
  photos: CoverPhotoMap;
  /** バケツの取得に失敗して、写真が有るか無いか分からない蓋 id（文字列）。次に頼まれたら取り直す */
  failedIds: Set<string>;
};

/**
 * 蓋 id の並びに対する代表写真を返す。
 * 「写真が無い蓋」と「取れなかった蓋」を分けて返すので、呼び出し側は後者を確定させずに取り直せる。
 * signal で中断されたら、取れた分にかかわらず AbortError を投げる。
 */
export async function fetchCoverPhotos(
  manholeIds: number[],
  { signal }: { signal?: AbortSignal } = {}
): Promise<CoverPhotosResult> {
  const wanted = new Set(manholeIds.filter((id) => Number.isInteger(id) && id > 0));
  const buckets = coverPhotoBucketsFor(Array.from(wanted));
  const results = await Promise.all(
    buckets.map((bucket) =>
      fetchBucket(bucket).catch((error: unknown) => {
        console.error('Failed to load cover photos:', error);
        return null;
      })
    )
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const photos: CoverPhotoMap = {};
  const failedIds = new Set<string>();
  for (const id of wanted) {
    const bucketPhotos = results[buckets.indexOf(coverPhotoBucketOf(id))];
    if (bucketPhotos === null || bucketPhotos === undefined) {
      failedIds.add(String(id));
      continue;
    }
    const photo = bucketPhotos[String(id)];
    if (photo) photos[String(id)] = photo;
  }
  return { photos, failedIds };
}
