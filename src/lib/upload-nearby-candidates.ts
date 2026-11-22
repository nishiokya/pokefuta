import { calculateDistance, MAX_DISTANCE_KM } from './location';

/**
 * 写真の位置から 50m 以内に蓋が無いとき、投稿者に選んでもらう候補を出す範囲（300m）。
 *
 * GPS は街中のビル陰や撮影後の移動で数十〜百数十 m ずれることがあり、50m 以内だけだと
 * 実際にその蓋を撮った写真まで「見つかりません」で止まっていた。50m 以内は今までどおり
 * 自動で決め、50m を超えて 300m 以内の蓋は、投稿者が自分で選んだときだけ受け付ける。
 * サーバー（/api/image-upload）は nearby_pick が付いた投稿にだけこの範囲を許す。
 */
export const NEARBY_PICK_MAX_KM = 0.3;

/** 候補として並べる最大の枚数 */
export const NEARBY_PICK_LIMIT = 5;

export interface NearbyCandidate<M> {
  manhole: M;
  distanceM: number;
}

interface LocatedManhole {
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * 50m を超え 300m 以内の蓋を近い順に返す（50m 以内の蓋があるときは自動で決まるので呼ばない）。
 */
export function findNearbyPickCandidates<M extends LocatedManhole>(
  lat: number,
  lng: number,
  manholes: M[],
  maxKm: number = NEARBY_PICK_MAX_KM,
  limit: number = NEARBY_PICK_LIMIT
): NearbyCandidate<M>[] {
  const hits: { manhole: M; distanceKm: number }[] = [];
  for (const manhole of manholes) {
    if (manhole.latitude == null || manhole.longitude == null) continue;
    const distanceKm = calculateDistance(lat, lng, manhole.latitude, manhole.longitude);
    if (distanceKm > MAX_DISTANCE_KM && distanceKm <= maxKm) hits.push({ manhole, distanceKm });
  }
  return hits
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map(({ manhole, distanceKm }) => ({ manhole, distanceM: Math.round(distanceKm * 1000) }));
}

/** サーバー側で許す距離の上限。投稿者が候補から選んだ投稿（nearby_pick）だけ 300m まで */
export function allowedUploadDistanceKm(nearbyPick: boolean): number {
  return nearbyPick ? NEARBY_PICK_MAX_KM : MAX_DISTANCE_KM;
}
