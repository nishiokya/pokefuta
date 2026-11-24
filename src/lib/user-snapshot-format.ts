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

/**
 * 書き込み中のロック。本人の書き込みが DB を変える前に置き、終わったら外す（作り直した JSON で置き換える）。
 *
 * holders は「書き込み中の人の印 → 期限（ミリ秒）」。期限内の印が1つでもある間は、
 * 表示の側は DB から読むだけで R2 に書き戻さない。書き戻せると、ロックを置いたあと DB が変わる前に
 * 読んだ古い内容（非公開にする前の訪問など）が保存されてしまう（PR の Codex レビュー）。
 *
 * 書き込みのあとの作り直しが失敗してもロックは期限で切れる。そのあとの表示は DB の変更後に読むので、古い内容は戻らない。
 * 期限は書き込み1回にかかる時間より十分長くする。
 */
export const USER_SNAPSHOT_LOCK_MS = 5 * 60 * 1000;

export type UserSnapshotLock = {
  v: typeof USER_SNAPSHOT_VERSION;
  lock: true;
  publicUserId: string;
  holders: Record<string, number>;
};

/** ロックなら期限内の印だけを返す（空なら、だれも書き込み中でない＝無いのと同じ）。ロックでなければ null */
export function parseUserSnapshotLock(
  body: string,
  publicUserId: string,
  now: number = Date.now(),
): Record<string, number> | null {
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || data.lock !== true || data.publicUserId !== publicUserId) return null;
  if (!data.holders || typeof data.holders !== 'object') return {};
  const active: Record<string, number> = {};
  for (const [nonce, until] of Object.entries(data.holders)) {
    // 未来すぎる期限（時計のずれ・壊れた値）は信用しない
    if (typeof until === 'number' && until > now && until <= now + USER_SNAPSHOT_LOCK_MS * 2) active[nonce] = until;
  }
  return active;
}

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
  /**
   * 一部が読めなかったときだけ入る（R2 には保存しない）。読めなかった部分を使う側は例外にする。
   * 以前は県別・カード・件数を別々に読んでいて、1つの失敗がほかの表示を巻き込まなかった。それを保つ
   */
  missing?: { cards?: true; progress?: true; stats?: true };
};

/** R2 のキー。公開IDは URL にも出ている値なので、キーに入れてよい。必ず normalizeSnapshotUserId を通した値で呼ぶ */
export function userSnapshotKey(publicUserId: string): string {
  return `snapshots/users/v${USER_SNAPSHOT_VERSION}/${publicUserId}.json`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * スナップショットのキーに使う形（小文字の UUID）にする。UUID でなければ null（スナップショットを使わない）。
 * DB は大文字の UUID も同じ人として返すが、R2 のキーは大文字・小文字を区別する。
 * 大文字の URL で作られた JSON は、書き込み後の作り直し（小文字の公開ID）から漏れる（PR の Codex レビュー）。
 */
export function normalizeSnapshotUserId(value: string): string | null {
  const lower = value.trim().toLowerCase();
  return UUID_RE.test(lower) ? lower : null;
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
  if (data.missing !== undefined) return null;
  return data as UserSnapshot;
}
