import 'server-only';
import { cache } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { R2StorageAdapter } from '@/lib/storage/r2';
import { loadPublicVisitStats } from '@/lib/public-visit-stats';
import {
  USER_SNAPSHOT_CARD_LIMIT,
  USER_SNAPSHOT_VERSION,
  normalizeSnapshotUserId,
  parseUserSnapshot,
  userSnapshotKey,
  type SnapshotCardRow,
  type SnapshotProfileRow,
  type SnapshotProgressRow,
  type UserSnapshot,
  type UserSnapshotTombstone,
} from '@/lib/user-snapshot-format';

/**
 * 公開スタンプ帳のスナップショット（公開IDごとの JSON を R2 に置く）。
 *
 * なぜ: /users/[userId] は1回の表示でプロフィール・訪問カード・県別・件数3種・アイコンと
 * 約8本 Supabase を呼んでいた。Supabase の応答は中身のほかにヘッダが1本あたり約1.2KB つき、
 * egress の大半が「本数」から来ていた（2026-11-24 の edge_logs）。R2 からの読み出しは
 * サーバー内で完結し egress がかからない。
 *
 * 鮮度（非公開に戻した訪問が残らないこと）の守り方:
 * - 本人の書き込み（投稿・訪問の編集/削除・まとめて公開・写真の削除・プロフィール・アイコン・
 *   デザインマンホールの投稿）では、始める前に beginOwnSnapshotWrite() で印を置き、
 *   成功したあとに finishOwnSnapshotWrite() で作り直す。
 * - 書き戻しはすべて条件つき（R2 を読んだときの ETag のままなら / 無いときだけ）。R2 を先に読み、
 *   そのあと DB を読むので、その間にほかの書き込みが入っていたら ETag が変わって書けない。
 *   古い内容で新しい内容を上書きしない（R2 は PutObject の If-Match / If-None-Match に対応している）。
 * - 作り直せなかったら、消すのではなく「作り直せなかった印」を上書きで置く。印も ETag を変えるので、
 *   その前から走っていた表示の書き戻しを弾ける（消すと「無いときだけ書く」が通ってしまう）。
 * - アプリを通らない変更（自動採点・マイグレーション・審査）は寿命（1日）で拾う。
 *
 * 残る穴: 前の印もあとの作り直し・印もすべて失敗する（R2 か DB がその間ずっと使えない）と、
 * 最大で寿命のあいだ古い JSON が残る。そのときは `[user-snapshot] STALE` をエラーで出す（CloudWatch で拾える）。
 * 自分の訪問の表示名が、いいね・コメントのついでの upsert_app_user で変わる分（未カスタマイズの名前だけ）は寿命で拾う。
 *
 * JSON は R2 のバケット内で非公開（公開 URL を作らない）。サーバーが S3 API で読むだけ。
 */

const R2_READ_TIMEOUT_MS = 1500;
const R2_WRITE_TIMEOUT_MS = 2000;
/** PostgREST の1回の上限（supabase/config.toml の max_rows）。これより多い訪問はページを分けて読む */
const PAGE_ROWS = 1000;
const CONTENT_TYPE = 'application/json; charset=utf-8';

let adapter: R2StorageAdapter | null | undefined;
function snapshotStore(): R2StorageAdapter | null {
  if (adapter !== undefined) return adapter;
  // R2 以外の保存先（ローカルの Supabase Storage など）ではスナップショットを使わず、毎回 DB から読む
  const provider = process.env.STORAGE_PROVIDER ?? 'r2';
  try {
    adapter = provider === 'r2' ? new R2StorageAdapter() : null;
  } catch (error) {
    console.warn('[user-snapshot] R2 is not configured; reading from the DB:', error);
    adapter = null;
  }
  return adapter;
}

/** 毎回取り直す anon クライアント（Next.js の Data Cache に載せない） */
function liveClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** 件数 RPC。失敗は null（スナップショットを保存しない印）。表示は 0 にする */
async function countRpc(client: SupabaseClient<Database>, rpc: string, publicUserId: string): Promise<number | null> {
  try {
    const { data, error } = await client.rpc(rpc as never, { p_user_id: publicUserId } as never);
    if (error) {
      console.warn(`[user-snapshot] ${rpc} failed:`, error.message);
      return null;
    }
    return typeof data === 'number' && data > 0 ? data : 0;
  } catch (error) {
    console.warn(`[user-snapshot] ${rpc} failed:`, error);
    return null;
  }
}

async function avatarRpc(client: SupabaseClient<Database>, publicUserId: string): Promise<string | null | undefined> {
  try {
    const { data, error } = await client.rpc('get_public_avatar_photo_id' as never, { p_user_id: publicUserId } as never);
    if (error) {
      console.warn('[user-snapshot] get_public_avatar_photo_id failed:', error.message);
      return undefined;
    }
    return typeof data === 'string' ? data : null;
  } catch {
    return undefined;
  }
}

async function loadCards(client: SupabaseClient<Database>, publicUserId: string): Promise<SnapshotCardRow[]> {
  const { data, error } = await client
    .from('public_user_visit_card')
    .select(
      'id, manhole_id, shot_at, comment, created_at,' +
      ' manhole_title, manhole_prefecture, manhole_municipality, manhole_pokemons,' +
      ' latest_photo_id, latest_photo_is_landscape, latest_photo_ai_tags'
    )
    .eq('public_user_id', publicUserId)
    .order('shot_at', { ascending: false })
    .limit(USER_SNAPSHOT_CARD_LIMIT);
  if (error) throw new Error(error.message);
  return (data || []) as unknown as SnapshotCardRow[];
}

/**
 * 蓋のある公開訪問の全件（県別の進み具合用）。1回の上限（1000行）を超える人がいるのでページを分けて読む。
 * 以前は県別ページが県で絞って読んでいたので、全県で1000件を超えてもその県の分は欠けなかった。
 */
async function loadProgressRows(client: SupabaseClient<Database>, publicUserId: string): Promise<SnapshotProgressRow[]> {
  const rows: SnapshotProgressRow[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await client
      .from('public_user_visit_card')
      .select(
        'manhole_id, shot_at, created_at, manhole_prefecture,' +
        ' latest_photo_id, latest_photo_created_at, latest_photo_is_landscape'
      )
      .eq('public_user_id', publicUserId)
      .not('manhole_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as unknown as SnapshotProgressRow[];
    rows.push(...page);
    if (page.length < PAGE_ROWS) return rows;
  }
}

type Built = { snapshot: UserSnapshot; complete: boolean };

/**
 * DB から作る。利用者がいなければ null。プロフィールが読めなければ例外（ページは今までどおり 500）。
 * カード・県別・件数・アイコンの失敗は、その部分だけを欠けた扱い（missing / 0 / なし）にして complete=false。
 * complete=false は R2 に保存しない。
 */
async function buildUserSnapshot(publicUserId: string): Promise<Built | null> {
  const client = liveClient();
  if (!client) throw new Error('Supabase client is not configured');

  const settle = <T>(promise: Promise<T>) => promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => {
      console.warn('[user-snapshot] partial read failed:', error);
      return { ok: false as const };
    },
  );

  const [profileResult, avatar, cards, progress, stats, designManhole, plush, snow] = await Promise.all([
    client.rpc('get_public_profile' as never, { p_user_id: publicUserId } as never),
    avatarRpc(client, publicUserId),
    settle(loadCards(client, publicUserId)),
    settle(loadProgressRows(client, publicUserId)),
    settle(loadPublicVisitStats(client, publicUserId)),
    countRpc(client, 'get_public_design_manhole_count', publicUserId),
    countRpc(client, 'get_public_plush_visit_count', publicUserId),
    countRpc(client, 'get_public_snow_visit_count', publicUserId),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = (profileResult.data as SnapshotProfileRow[] | null)?.[0] ?? null;
  if (!profile) return null;

  const missing: NonNullable<UserSnapshot['missing']> = {};
  if (!cards.ok) missing.cards = true;
  if (!progress.ok) missing.progress = true;
  if (!stats.ok) missing.stats = true;

  const snapshot: UserSnapshot = {
    v: USER_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    publicUserId,
    profile,
    avatarPhotoId: avatar ?? null,
    cards: cards.ok ? cards.value : [],
    progressRows: progress.ok ? progress.value : [],
    stats: stats.ok ? stats.value : { totalVisits: 0, prefectureCount: 0 },
    counts: { designManhole: designManhole ?? 0, plush: plush ?? 0, snow: snow ?? 0 },
  };
  const complete = Object.keys(missing).length === 0
    && avatar !== undefined && designManhole !== null && plush !== null && snow !== null;
  if (Object.keys(missing).length > 0) snapshot.missing = missing;
  return { snapshot, complete };
}

type ReadResult = { snapshot: UserSnapshot | null; etag: string | null; exists: boolean; ok: boolean };

async function readSnapshot(store: R2StorageAdapter, publicUserId: string): Promise<ReadResult> {
  try {
    const object = await store.getText(userSnapshotKey(publicUserId), R2_READ_TIMEOUT_MS);
    if (!object) return { snapshot: null, etag: null, exists: false, ok: true };
    return {
      // 古い・別の版・作り直せなかった印は null（＝作り直す）
      snapshot: parseUserSnapshot(object.body, publicUserId),
      etag: object.etag,
      exists: true,
      ok: true,
    };
  } catch (error) {
    console.warn('[user-snapshot] read failed; reading from the DB:', error);
    return { snapshot: null, etag: null, exists: false, ok: false };
  }
}

/** 読んだときの状態が変わっていなければ書く。変わっていたら false（新しい方を残す） */
async function writeIfUnchanged(store: R2StorageAdapter, read: ReadResult, snapshot: UserSnapshot): Promise<boolean> {
  const key = userSnapshotKey(snapshot.publicUserId);
  const body = JSON.stringify(snapshot);
  if (read.exists) {
    // ETag が取れないと条件をつけられないので書かない
    if (!read.etag) return false;
    return store.putTextIf(key, body, { contentType: CONTENT_TYPE, timeoutMs: R2_WRITE_TIMEOUT_MS, ifMatch: read.etag });
  }
  return store.putTextIf(key, body, { contentType: CONTENT_TYPE, timeoutMs: R2_WRITE_TIMEOUT_MS, ifNoneMatch: '*' });
}

/** 作り直せなかった印を上書きで置く。置けなければ例外 */
async function putTombstone(store: R2StorageAdapter, publicUserId: string): Promise<void> {
  const tombstone: UserSnapshotTombstone = {
    v: USER_SNAPSHOT_VERSION,
    tombstone: true,
    publicUserId,
    at: new Date().toISOString(),
  };
  await store.putTextIf(userSnapshotKey(publicUserId), JSON.stringify(tombstone), {
    contentType: CONTENT_TYPE,
    timeoutMs: R2_WRITE_TIMEOUT_MS,
  });
}

/**
 * 公開スタンプ帳のデータ。R2 にあればそれ、無い・古い・読めないときは DB から作って置いておく。
 * 利用者がいなければ null。1リクエストの中ではページ本文・generateMetadata・OGP で使い回す。
 */
export const loadUserSnapshot = cache(async (publicUserId: string): Promise<UserSnapshot | null> => {
  const raw = publicUserId.trim();
  if (!raw) return null;
  const id = normalizeSnapshotUserId(raw);
  const store = id ? snapshotStore() : null;
  // UUID でない ID は今までどおり DB に渡す（DB が null かエラーを返す）
  if (!id || !store) return (await buildUserSnapshot(id ?? raw))?.snapshot ?? null;

  const read = await readSnapshot(store, id);
  if (read.snapshot) return read.snapshot;

  const built = await buildUserSnapshot(id);
  if (!built) return null;
  // 読み出しに失敗したときは、そこにある版が分からないので書かない
  if (built.complete && read.ok) {
    try {
      await writeIfUnchanged(store, read, built.snapshot);
    } catch (error) {
      console.warn('[user-snapshot] write failed:', error);
    }
  }
  return built.snapshot;
});

/** 作り直しに使う時間の上限。超えたら打ち切って印を置く（印の書き込みは R2_WRITE_TIMEOUT_MS まで別にかかる） */
const REFRESH_TIMEOUT_MS = 3000;
const RESOLVE_TIMEOUT_MS = 1500;

/**
 * 作り直す。できなければ「作り直せなかった印」を置く。どちらもできなければ false。
 */
async function refreshUserSnapshot(store: R2StorageAdapter, publicUserId: string): Promise<boolean> {
  const attempt = async (): Promise<boolean> => {
    // 2回まで: 1回目の間にほかの書き込み（同じ人のまとめて投稿など）が先に書いたら、読み直して作り直す
    for (let i = 0; i < 2; i += 1) {
      const read = await readSnapshot(store, publicUserId);
      if (!read.ok) return false;
      const built = await buildUserSnapshot(publicUserId);
      if (!built || !built.complete) return false;
      if (await writeIfUnchanged(store, read, built.snapshot)) return true;
    }
    return false;
  };

  try {
    if (await withTimeout(attempt(), REFRESH_TIMEOUT_MS, 'snapshot refresh')) return true;
  } catch (error) {
    console.warn('[user-snapshot] refresh failed:', error);
  }
  return tryTombstone(store, publicUserId);
}

async function tryTombstone(store: R2StorageAdapter, publicUserId: string): Promise<boolean> {
  try {
    await putTombstone(store, publicUserId);
    return true;
  } catch (error) {
    console.warn('[user-snapshot] could not put a tombstone:', error);
    return false;
  }
}

/**
 * 本人の公開ID（app_user.id）。get_public_user_ids は公開訪問が0件になった人を返さないので使わない
 * （最後の1件を非公開にしたときに引けない）。失敗・時間切れは null。
 */
async function resolveOwnPublicUserId(supabase: SupabaseClient<any>): Promise<string | null> {
  for (let i = 0; i < 2; i += 1) {
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(supabase.rpc('get_own_profile' as never)),
        RESOLVE_TIMEOUT_MS,
        'get_own_profile',
      );
      if (error) throw error;
      const row = ((data as unknown as { public_user_id?: string | null }[] | null) || [])[0];
      return row?.public_user_id ? normalizeSnapshotUserId(row.public_user_id) : null;
    } catch (error) {
      console.warn('[user-snapshot] get_own_profile failed:', error);
    }
  }
  return null;
}

export type OwnSnapshotWrite = Promise<{ publicUserId: string | null; invalidated: boolean }>;

/**
 * 本人の書き込みを始める前に呼ぶ（await しなくてよい。書き込みと並べて走らせる）。
 * 公開IDを引き、先に「作り直せなかった印」を置いておく。
 * こうしておくと、書き込みのあとの作り直しと印の両方が失敗しても（R2 が書き込みの途中から使えなくなっても）、
 * 書き込み前の JSON はもう配られない。印を見た表示は DB から読む。
 */
export function beginOwnSnapshotWrite(supabase: SupabaseClient<any>): OwnSnapshotWrite {
  const store = snapshotStore();
  if (!store) return Promise.resolve({ publicUserId: null, invalidated: true });
  return (async () => {
    const publicUserId = await resolveOwnPublicUserId(supabase);
    if (!publicUserId) return { publicUserId: null, invalidated: false };
    return { publicUserId, invalidated: await tryTombstone(store, publicUserId) };
  })();
}

/**
 * 本人の書き込みが成功したあとに呼ぶ。今の DB から作り直す（できなければ印を置く）。
 * 例外は投げない（書き込み自体は成功している）。待ち時間はおおむね RESOLVE + REFRESH + 印の書き込みまで。
 *
 * 書き込みの前の印も、あとの作り直し・印も、すべて失敗したときだけ古い JSON が寿命（1日）まで残る。
 * そのときは `[user-snapshot] STALE` をエラーで出す。
 */
export async function finishOwnSnapshotWrite(supabase: SupabaseClient<any>, begun: OwnSnapshotWrite): Promise<void> {
  const store = snapshotStore();
  if (!store) return;
  const before = await begun;
  const publicUserId = before.publicUserId ?? (await resolveOwnPublicUserId(supabase));
  if (!publicUserId) {
    // 公開IDが引けない＝ app_user がまだ無い人（公開スタンプ帳も無い）か、DB に届かない
    console.error('[user-snapshot] STALE: could not resolve own public id; a snapshot (if any) may be served for up to a day');
    return;
  }
  const after = await refreshUserSnapshot(store, publicUserId);
  if (!after && !before.invalidated) {
    console.error('[user-snapshot] STALE: could not invalidate; the old snapshot may be served for up to a day:', publicUserId);
  }
}
