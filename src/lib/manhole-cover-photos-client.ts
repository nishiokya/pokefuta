import { coverPhotoBucketOf, coverPhotoBucketsFor, type CoverPhoto } from './manhole-cover-photos';

type CoverPhotoMap = Record<string, CoverPhoto>;

/**
 * 取りに行ったバケツの結果をページ内で持つ。打つたびに候補が変わる /upload でも、
 * 同じバケツは1回しか取りに行かない。失敗したバケツは捨てて、次に頼まれたときに取り直す。
 */
const bucketCache = new Map<number, Promise<CoverPhotoMap>>();

const fetchBucket = (bucket: number): Promise<CoverPhotoMap> => {
  const cached = bucketCache.get(bucket);
  if (cached) return cached;
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
  bucketCache.set(bucket, request);
  return request;
};

/**
 * 蓋 id の並びに対する代表写真を返す（キーは蓋 id の文字列）。
 * 取れなかったバケツの蓋は結果に入らない（呼び出し側はプレースホルダーのまま出す）。
 * signal で中断されたら、取れた分にかかわらず AbortError を投げる。
 */
export async function fetchCoverPhotos(
  manholeIds: number[],
  { signal }: { signal?: AbortSignal } = {}
): Promise<CoverPhotoMap> {
  const wanted = new Set(manholeIds.filter((id) => Number.isInteger(id) && id > 0));
  const buckets = coverPhotoBucketsFor(Array.from(wanted));
  const results = await Promise.all(
    buckets.map((bucket) =>
      fetchBucket(bucket).catch((error: unknown) => {
        console.error('Failed to load cover photos:', error);
        return {} as CoverPhotoMap;
      })
    )
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const photos: CoverPhotoMap = {};
  for (const id of wanted) {
    const bucketPhotos = results[buckets.indexOf(coverPhotoBucketOf(id))];
    const photo = bucketPhotos?.[String(id)];
    if (photo) photos[String(id)] = photo;
  }
  return photos;
}
