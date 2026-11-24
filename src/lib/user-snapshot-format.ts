/**
 * 公開スタンプ帳（/users/[userId] とその県別・OGP）のスナップショットの形。
 * 読み書きは src/lib/user-snapshot.ts。ここは DB にも R2 にも触らない（テストから読む）。
 *
 * 中身は公開ページがもともと anon で読んでいたものだけ（公開プロフィール RPC・公開訪問ビュー・公開件数 RPC）。
 */

/** 形を変えたら上げる。古い版のオブジェクトは読まずに作り直す */
export const USER_SNAPSHOT_VERSION = 1;

/**
 * アプリを通らない変更（毎朝の自動採点の ai_tags・写真の向き、マイグレーションでの蓋の直し、
 * デザインマンホールの審査）を拾うための寿命。これを過ぎたら DB から作り直す。
 */
export const USER_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type SnapshotProfileRow = {
  display_name: string | null;
  bio?: string | null;
  x_url?: string | null;
  instagram_url?: string | null;
  pokemon_go_friend_code?: string | null;
  pokemon_go_friend_note?: string | null;
};

/** public_user_visit_card の行（一覧のカード用・新しい順に最大 USER_SNAPSHOT_CARD_LIMIT 件） */
export type SnapshotCardRow = {
  id: string;
  manhole_id: number | null;
  shot_at: string | null;
  comment: string | null;
  created_at: string | null;
  manhole_title: string | null;
  manhole_prefecture: string | null;
  manhole_municipality: string | null;
  manhole_pokemons: string[] | null;
  latest_photo_id: string | null;
  latest_photo_is_landscape: boolean | null;
  latest_photo_ai_tags: unknown;
};

/** public_user_visit_card の行（県別の進み具合用・蓋のある訪問の全件） */
export type SnapshotProgressRow = {
  manhole_id: number | null;
  shot_at: string | null;
  created_at: string | null;
  manhole_prefecture: string | null;
  latest_photo_id: string | null;
  latest_photo_is_landscape: boolean | null;
  latest_photo_created_at: string | null;
};

export const USER_SNAPSHOT_CARD_LIMIT = 500;

export type UserSnapshot = {
  v: typeof USER_SNAPSHOT_VERSION;
  generatedAt: string;
  publicUserId: string;
  profile: SnapshotProfileRow;
  avatarPhotoId: string | null;
  cards: SnapshotCardRow[];
  progressRows: SnapshotProgressRow[];
  stats: { totalVisits: number; prefectureCount: number };
  counts: { designManhole: number; plush: number; snow: number };
};

/** R2 のキー。公開IDは URL にも出ている値なので、キーに入れてよい */
export function userSnapshotKey(publicUserId: string): string {
  return `snapshots/users/v${USER_SNAPSHOT_VERSION}/${publicUserId}.json`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** スナップショットを置いてよい公開IDか（キーに変な文字を入れない） */
export function isSnapshotUserId(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * 読んだ JSON を確かめる。版・持ち主・寿命のどれかが合わなければ null（＝DB から作り直す）。
 */
export function parseUserSnapshot(
  body: string,
  publicUserId: string,
  now: number = Date.now(),
): UserSnapshot | null {
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (data.v !== USER_SNAPSHOT_VERSION) return null;
  if (data.publicUserId !== publicUserId) return null;
  const generated = Date.parse(data.generatedAt);
  if (!Number.isFinite(generated)) return null;
  // 未来の時刻（時計のずれ）も古いものと同じに扱う
  if (now - generated > USER_SNAPSHOT_MAX_AGE_MS || generated - now > 5 * 60 * 1000) return null;
  if (!data.profile || typeof data.profile !== 'object') return null;
  if (!Array.isArray(data.cards) || !Array.isArray(data.progressRows)) return null;
  if (!data.stats || typeof data.stats.totalVisits !== 'number' || typeof data.stats.prefectureCount !== 'number') return null;
  if (!data.counts || typeof data.counts.designManhole !== 'number' || typeof data.counts.plush !== 'number' || typeof data.counts.snow !== 'number') return null;
  if (data.avatarPhotoId !== null && typeof data.avatarPhotoId !== 'string') return null;
  return data as UserSnapshot;
}
