import 'server-only';
import { calculateDistance } from '@/lib/location';
import { manholeLabel } from '@/lib/manhole-label';
import { NEARBY_RADIUS_KM } from '@/lib/manhole-stats';
import { nearbyArea } from '@/lib/nearby-area';
import { loadPublicVisitStats } from '@/lib/public-visit-stats';
import { loadPublicDesignManholeCount } from '@/lib/design-manhole-submitter';
import {
  FALLBACK_DISPLAY_NAME,
  getPublicLiveClient,
  type PublicProfileRow,
} from '@/lib/user-prefecture-progress';
import {
  loadCachedAvatars,
  loadCachedDesignManholeSnapshot,
  loadCachedManholes,
  type SnapshotManhole,
} from '@/lib/manhole-snapshot';
import type { SnapshotDesignManhole } from '@/lib/design-manhole-snapshot-parse';
import { avatarsFor } from '@/lib/avatar-snapshot';

/**
 * デザインマンホールの詳細ページに足す「投稿者」「近くのポケふた」「近くのデザインマンホール」「場所のタグ」。
 *
 * どれも取れなければ出さないだけで、ページ本体は落とさない（紐付けの読み込みと同じ方針）。
 */

/** 図鑑の「次に寄れるポケふた」と同じ5件 */
export const NEARBY_POKEFUTA_LIMIT = 5;
/** 30km 以内に1枚も無いときに出す、いちばん近いポケふたの数 */
export const NEARBY_POKEFUTA_FALLBACK_LIMIT = 3;
export const NEARBY_DESIGN_MANHOLE_LIMIT = 6;

type Point = { latitude: number; longitude: number };

/** 図鑑が遅い・落ちているときは 1.5 秒で見切り、近くの節を出さないだけでページは待たせない */
const SNAPSHOT_TIMEOUT_MS = 1500;

/** 近くのポケふたを出すための蓋の一覧（図鑑のスナップショット、全件で約720KB） */
export async function loadSnapshotManholesForNearby(): Promise<SnapshotManhole[]> {
  return (await loadCachedManholes({ timeoutMs: SNAPSHOT_TIMEOUT_MS })) ?? [];
}

/**
 * 近くのデザインマンホールを出すための公開中の一覧（図鑑のスナップショット、日次）。
 * 以前は公開の全件を Supabase から毎回読んでいて、Egress のいちばん大きな塊だった。
 */
export async function loadSnapshotDesignManholesForNearby(): Promise<SnapshotDesignManhole[]> {
  return (await loadCachedDesignManholeSnapshot({ timeoutMs: SNAPSHOT_TIMEOUT_MS })) ?? [];
}

export type NearbyPokefuta = { id: number; label: string; distanceKm: number };

export type NearbyDesignManhole = {
  id: string;
  title: string;
  distanceKm: number;
  photoUrl: string;
};

/** 場所のタグ。位置から近くのポケふたの所在地で推定したもの（逆ジオコーディングはしない） */
export type PlaceTag = { label: string; href: string | null };

export type DesignManholeSubmitterProfile = {
  publicId: string;
  displayName: string;
  avatarPhotoId: string | null;
  totalVisits: number;
  prefectureCount: number;
  designManholeCount: number;
};

const hasPoint = (m: { latitude?: number | null; longitude?: number | null }) =>
  typeof m.latitude === 'number' &&
  typeof m.longitude === 'number' &&
  Number.isFinite(m.latitude) &&
  Number.isFinite(m.longitude);

export function nearbyPokefuta(origin: Point, manholes: SnapshotManhole[]) {
  const withDistance = manholes
    .filter(hasPoint)
    .map((m) => ({
      manhole: m,
      distanceKm: calculateDistance(origin.latitude, origin.longitude, m.latitude, m.longitude),
    }))
    // 同じ距離の蓋が並んでも順序が揺れないよう id を第2キーにする（ポケふた詳細と同じ）
    .sort((a, b) => a.distanceKm - b.distanceKm || b.manhole.id - a.manhole.id);

  // 30km 以内に無い（群馬・山梨など公式のポケふたが無い県）ときも、いちばん近い数枚は出す。
  // 遠くても「次に撮りに行ける1枚」が分かるほうが、節ごと消えるより役に立つ
  const withinRadius = withDistance.filter((e) => e.distanceKm <= NEARBY_RADIUS_KM);
  const nearbyIsFallback = withinRadius.length === 0;
  const nearby: NearbyPokefuta[] = (nearbyIsFallback ? withDistance.slice(0, NEARBY_POKEFUTA_FALLBACK_LIMIT) : withinRadius)
    .slice(0, NEARBY_POKEFUTA_LIMIT)
    .map((e) => ({ id: e.manhole.id, label: manholeLabel(e.manhole), distanceKm: e.distanceKm }));

  // 「だいたい〇〇あたり」と図鑑の県ページ。近い蓋が10km以内に無ければ地名は出さない（nearby-area.ts）
  const area = nearbyArea(withDistance.slice(0, 20).map((e) => ({ ...e.manhole, distance: e.distanceKm })));
  const placeTags: PlaceTag[] = [];
  const nearestPrefecture = area.areaLabel ? area.prefectures[0] : null;
  if (nearestPrefecture) {
    placeTags.push({ label: nearestPrefecture.name, href: nearestPrefecture.dexUrl });
    const muni = area.areaLabel!.slice(nearestPrefecture.name.length);
    if (muni) placeTags.push({ label: muni, href: null });
  }

  return { nearby, nearbyIsFallback, placeTags };
}

export function nearbyDesignManholes(
  self: Point & { id: string },
  designManholes: Array<Point & { id: string; title: string | null }>
): NearbyDesignManhole[] {
  return designManholes
    .filter((d) => d.id !== self.id && hasPoint(d))
    .map((d) => ({
      id: d.id,
      title: d.title || 'デザインマンホール',
      distanceKm: calculateDistance(self.latitude, self.longitude, d.latitude, d.longitude),
      photoUrl: `/api/design-manholes/${d.id}/photo?size=small`,
    }))
    .filter((d) => d.distanceKm <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
    .slice(0, NEARBY_DESIGN_MANHOLE_LIMIT);
}

/**
 * 投稿者の公開プロフィール（公開スタンプ帳を持つ人だけ）。
 * 公開スタンプ帳と同じ RPC・公開ビューから数えるので、リンク先の数字と食い違わない。
 * 訪問カード（最大500件）は読まない。
 */
/**
 * 投稿者のアイコン。図鑑の avatars.json（日次）から引き、取れないときだけ RPC。
 * 投稿詳細はクローラーも多く、1枚ごとに RPC を呼ぶと Supabase へのリクエストが増える。
 */
async function loadSubmitterAvatar(
  client: NonNullable<ReturnType<typeof getPublicLiveClient>>,
  publicId: string
): Promise<string | null> {
  const snapshot = await loadCachedAvatars({ timeoutMs: SNAPSHOT_TIMEOUT_MS });
  if (snapshot) return avatarsFor([publicId], snapshot)[publicId] ?? null;
  return client
    .rpc('get_public_avatar_photo_id' as never, { p_user_id: publicId } as never)
    .then(
      (r: { data: unknown; error: unknown }) => (r.error || typeof r.data !== 'string' ? null : r.data),
      () => null
    );
}

export async function loadDesignManholeSubmitterProfile(
  publicId: string
): Promise<DesignManholeSubmitterProfile | null> {
  const client = getPublicLiveClient();
  if (!client) return null;
  try {
    const [profile, avatar, stats, designManholeCount] = await Promise.all([
      client.rpc('get_public_profile' as never, { p_user_id: publicId } as never),
      loadSubmitterAvatar(client, publicId),
      loadPublicVisitStats(client, publicId).catch(() => null),
      loadPublicDesignManholeCount(publicId),
    ]);
    if (profile.error) {
      console.warn('Failed to load design manhole submitter profile:', profile.error.message);
      return null;
    }
    const row = (profile.data as PublicProfileRow[] | null)?.[0];
    if (!row) return null;
    return {
      publicId,
      displayName: row.display_name || FALLBACK_DISPLAY_NAME,
      avatarPhotoId: avatar,
      totalVisits: stats?.totalVisits ?? 0,
      prefectureCount: stats?.prefectureCount ?? 0,
      designManholeCount,
    };
  } catch (error) {
    console.warn('Failed to load design manhole submitter profile:', error);
    return null;
  }
}
