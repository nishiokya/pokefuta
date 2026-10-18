import { calculateDistance, isValidCoordinates, MAX_DISTANCE_KM } from './location';

// /upload/bulk の振り分け。写真ごとに最寄りの蓋を当て、「蓋 × 撮影日（日本時間）」の訪問にまとめる。
// 画面から切り離して、node:test で確かめられるようにしている。

/** 1回に読む写真の上限。読み取りは端末内で軽いが、iPhone のメモリと送信時間を考えて切る。 */
export const BULK_MAX_FILES = 100;

export interface BulkManhole {
  id: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface BulkPhotoInput {
  id: string;
  latitude?: number;
  longitude?: number;
  /** 撮影日時。EXIF が無ければファイルの更新日時を入れておく */
  shotAt: Date;
}

/** 自分の訪問（GET /api/visits のログイン時の応答から取り出したもの） */
export interface OwnVisit {
  id: string;
  manhole_id: number;
  shot_at: string;
  /** 写真を足すとき、サーバーはこの訪問の公開設定に従う（送った is_public は使わない） */
  is_public: boolean;
}

export type BulkPhotoStatus = 'ok' | 'posted' | 'far' | 'no_gps';

export interface NearestManhole<M extends BulkManhole> {
  manhole: M;
  /** 判定用。丸めない（サーバーも丸めずに 50m と比べる） */
  distanceKm: number;
  /** 表示用 */
  distanceM: number;
}

export interface BulkVisitGroup<M extends BulkManhole> {
  /** `${manhole.id}:${day}` */
  key: string;
  manhole: M;
  /** 撮影日（日本時間 YYYY-MM-DD） */
  day: string;
  photoIds: string[];
  /** 同じ蓋・同じ日の訪問が既にあれば、その id（写真を足す先） */
  existingVisitId: string | null;
  /** 足す先の訪問の公開設定。足した写真はこれに従う */
  existingVisitIsPublic: boolean | null;
  /** 自分がまだ一度も訪問していない蓋。同じ蓋が今回複数日あれば、一番早い日だけ true */
  isNewManhole: boolean;
  /** 一番早い写真の撮影日時。並べ替えと、新しく作る訪問の shot_at に使う */
  firstShotAt: Date;
}

export interface BulkClassification<M extends BulkManhole> {
  groups: BulkVisitGroup<M>[];
  /** GPS はあるが 50m 以内に蓋が無い写真。最寄りの蓋と距離つき */
  far: { photoId: string; nearest: NearestManhole<M> | null }[];
  noGps: string[];
  /** 写真 id → 状態（ok / posted は所属するグループで決まる） */
  statusById: Record<string, BulkPhotoStatus>;
  distanceMById: Record<string, number>;
  /** 自分がまだ一度も訪問していない蓋（表示の「初めて」とは別に、数えるために持つ） */
  newManholeIds: Set<number>;
}

const JST_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 日本時間の日付（YYYY-MM-DD）。訪問を日で分ける単位 */
export function jstDayKey(date: Date): string {
  return JST_DAY.format(date);
}

/** 距離の上限なしで一番近い蓋。50m を少し超えただけの写真に気づけるよう、蓋なしの写真にも出す */
export function findNearestManholeAnyDistance<M extends BulkManhole>(
  lat: number,
  lng: number,
  manholes: M[]
): NearestManhole<M> | null {
  let nearest: M | null = null;
  let minKm = Infinity;
  for (const manhole of manholes) {
    if (manhole.latitude == null || manhole.longitude == null) continue;
    const km = calculateDistance(lat, lng, manhole.latitude, manhole.longitude);
    if (km < minKm) {
      minKm = km;
      nearest = manhole;
    }
  }
  return nearest ? { manhole: nearest, distanceKm: minKm, distanceM: Math.round(minKm * 1000) } : null;
}

export function classifyBulkPhotos<M extends BulkManhole>(
  photos: BulkPhotoInput[],
  manholes: M[],
  ownVisits: OwnVisit[]
): BulkClassification<M> {
  const visitedManholeIds = new Set(ownVisits.map((v) => v.manhole_id));
  // 同じ蓋・同じ日に訪問が複数あるときは、先に投稿した方（一覧の後ろ＝古い方）に足す
  const existingVisitByKey = new Map<string, OwnVisit>();
  for (const visit of ownVisits) {
    const shotAt = new Date(visit.shot_at);
    if (Number.isNaN(shotAt.getTime())) continue;
    existingVisitByKey.set(`${visit.manhole_id}:${jstDayKey(shotAt)}`, visit);
  }

  const groupsByKey = new Map<string, BulkVisitGroup<M>>();
  const far: BulkClassification<M>['far'] = [];
  const noGps: string[] = [];
  const statusById: Record<string, BulkPhotoStatus> = {};
  const distanceMById: Record<string, number> = {};

  for (const photo of photos) {
    if (!isValidCoordinates(photo.latitude, photo.longitude)) {
      noGps.push(photo.id);
      statusById[photo.id] = 'no_gps';
      continue;
    }
    const nearest = findNearestManholeAnyDistance(photo.latitude as number, photo.longitude as number, manholes);
    if (!nearest || nearest.distanceKm > MAX_DISTANCE_KM) {
      far.push({ photoId: photo.id, nearest });
      statusById[photo.id] = 'far';
      continue;
    }
    distanceMById[photo.id] = nearest.distanceM;
    const day = jstDayKey(photo.shotAt);
    const key = `${nearest.manhole.id}:${day}`;
    const group = groupsByKey.get(key);
    if (group) {
      group.photoIds.push(photo.id);
      if (photo.shotAt < group.firstShotAt) group.firstShotAt = photo.shotAt;
    } else {
      groupsByKey.set(key, {
        key,
        manhole: nearest.manhole,
        day,
        photoIds: [photo.id],
        existingVisitId: existingVisitByKey.get(key)?.id ?? null,
        existingVisitIsPublic: existingVisitByKey.get(key)?.is_public ?? null,
        isNewManhole: false,
        firstShotAt: photo.shotAt,
      });
    }
  }

  // 撮影の古い順（旅の順番で見返せる）
  const groups = [...groupsByKey.values()].sort((a, b) => a.firstShotAt.getTime() - b.firstShotAt.getTime());
  const newManholeIds = new Set<number>();
  for (const group of groups) {
    if (!visitedManholeIds.has(group.manhole.id) && !newManholeIds.has(group.manhole.id)) {
      group.isNewManhole = true;
      newManholeIds.add(group.manhole.id);
    }
    // 写真の中も撮影順に
    for (const photoId of group.photoIds) {
      statusById[photoId] = group.existingVisitId ? 'posted' : 'ok';
    }
  }
  const order = new Map(photos.map((p, i) => [p.id, p.shotAt.getTime() * 1000 + i]));
  for (const group of groups) {
    group.photoIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  }

  return { groups, far, noGps, statusById, distanceMById, newManholeIds };
}

/**
 * 完了時の「新しく集めた蓋」。初めての蓋のうち、どれか1日分でも送れたものの数。
 * 表示の「初めて」は一番早い日にしか付かないので、それには頼らない
 * （早い日を外したり失敗したりして、後の日だけ送れても集めたことになる）。
 */
export function countNewManholes<M extends BulkManhole>(
  groups: BulkVisitGroup<M>[],
  newManholeIds: Set<number>,
  succeededKeys: Set<string>
): number {
  const ids = new Set<number>();
  for (const group of groups) {
    if (newManholeIds.has(group.manhole.id) && succeededKeys.has(group.key)) ids.add(group.manhole.id);
  }
  return ids.size;
}
