/**
 * 公開スタンプ帳（/users/[userId] とその県別・OGP）のスナップショットの形。
 * 読み書きは src/lib/user-snapshot.ts。ここは DB にも R2 にも触らない（テストから読む）。
 *
 * 中身は公開ページがもともと anon で読んでいたものだけ（DB の get_public_user_snapshot が既存の公開面から作る）。
 */

/** 形を変えたら上げる。古い版のオブジェクトは読まずに作り直す（1 はロック方式のころの形） */
export const USER_SNAPSHOT_VERSION = 2;

/**
 * 版（rev）で拾えない変更のための寿命。蓋のカタログ（名称・県・ポケモン）は版に入れていない
 * （全員の版を上げないため。公開データだけなので1日遅れてよい）。
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

/** DB の get_public_user_snapshot の LIMIT と同じ */
export const USER_SNAPSHOT_CARD_LIMIT = 500;

export type UserSnapshot = {
  v: typeof USER_SNAPSHOT_VERSION;
  generatedAt: string;
  publicUserId: string;
  /**
   * DB の版（get_public_snapshot_rev と同じ形 "<a>.<b>.<c>"）。データと同じ時点で読んだ値。
   * 今の版と違えば使わない（非公開化・削除・運用 SQL などの変更があった）
   */
  rev: string;
  profile: SnapshotProfileRow;
  avatarPhotoId: string | null;
  cards: SnapshotCardRow[];
  progressRows: SnapshotProgressRow[];
  stats: { totalVisits: number; prefectureCount: number };
  counts: { designManhole: number; plush: number; snow: number };
};

const REV_RE = /^\d+\.\d+\.\d+$/;

export function isSnapshotRev(value: unknown): value is string {
  return typeof value === 'string' && REV_RE.test(value);
}

/** OGP の版・R2 のキーに入れる形（英数字とハイフンだけ。route の検証 /^[A-Za-z0-9-]+$/ を通る） */
export function snapshotRevToken(rev: string): string {
  return `r${rev.replace(/\./g, '-')}`;
}

/** R2 のキー。公開IDは URL にも出ている値なので、キーに入れてよい。必ず normalizeSnapshotUserId を通した値で呼ぶ */
export function userSnapshotKey(publicUserId: string): string {
  return `snapshots/users/v${USER_SNAPSHOT_VERSION}/${publicUserId}.json`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * スナップショットのキーに使う形（小文字の UUID）にする。UUID でなければ null（スナップショットを使わない）。
 * DB は大文字の UUID も同じ人として返すが、R2 のキーは大文字・小文字を区別する。
 */
export function normalizeSnapshotUserId(value: string): string | null {
  const lower = value.trim().toLowerCase();
  return UUID_RE.test(lower) ? lower : null;
}

/** 形だけを確かめる（DB から来た値にも、R2 から読んだ値にも使う） */
function hasSnapshotShape(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (!isSnapshotRev(data.rev)) return false;
  if (!data.profile || typeof data.profile !== 'object') return false;
  if (!Array.isArray(data.cards) || !Array.isArray(data.progressRows)) return false;
  if (!data.stats || typeof data.stats.totalVisits !== 'number' || typeof data.stats.prefectureCount !== 'number') return false;
  if (!data.counts || typeof data.counts.designManhole !== 'number' || typeof data.counts.plush !== 'number' || typeof data.counts.snow !== 'number') return false;
  if (data.avatarPhotoId !== null && typeof data.avatarPhotoId !== 'string') return false;
  return true;
}

/**
 * DB の get_public_user_snapshot の戻り値をスナップショットにする。NULL（公開IDが無い）なら null。
 * 形が違えば例外（DB とアプリの版ずれ。黙って空のページにしない）。
 */
export function snapshotFromDb(data: unknown, publicUserId: string, now: number = Date.now()): UserSnapshot | null {
  if (data === null || data === undefined) return null;
  const raw = data as any;
  const candidate = {
    v: USER_SNAPSHOT_VERSION,
    generatedAt: new Date(now).toISOString(),
    publicUserId,
    rev: raw?.rev,
    profile: raw?.profile ?? null,
    avatarPhotoId: raw?.avatarPhotoId ?? null,
    cards: raw?.cards,
    progressRows: raw?.progressRows,
    stats: raw?.stats,
    counts: raw?.counts,
  };
  // プロフィールの行が無い（公開ID はあるのにプロフィール関数が返さない）ことは今の定義では無いが、念のため名前なしで出す
  if (candidate.profile === null) candidate.profile = { display_name: null };
  if (!hasSnapshotShape(candidate)) throw new Error('get_public_user_snapshot returned an unexpected shape');
  return candidate as UserSnapshot;
}

/**
 * 読んだ JSON を確かめる。版・持ち主・寿命・形のどれかが合わなければ null（＝DB から作り直す）。
 * DB の版（rev）との照合は呼び出し側（読んだ時点の版が要る）。
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
  if (!hasSnapshotShape(data)) return null;
  return data as UserSnapshot;
}
