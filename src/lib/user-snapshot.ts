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
  USER_SNAPSHOT_LOCK_MS,
  parseUserSnapshotLock,
  type UserSnapshot,
  type UserSnapshotLock,
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
 *   デザインマンホールの公開投稿）は、DB を変える直前に lockOwnSnapshot() でロックを置く。置けなければ書き込みを断る（503）。
 *   ロックの間、表示は DB から読むだけで R2 に書き戻さない。
 * - 書き込みのあと unlockOwnSnapshot() で今の DB から作り直してロックを外す。ほかの書き込みがまだロック中なら、
 *   自分の印だけ外して作り直しはその人に任せる。作り直せなかったらロックはそのまま期限（5分）で切れ、
 *   その後の表示が DB の変更後の内容で作り直す。
 * - 表示からの書き戻しは条件つき（R2 を読んだときの ETag のままなら / 無いときだけ）。R2 を先に読み、
 *   そのあと DB を読むので、その間にロックが置かれたら書けない（R2 は PutObject の If-Match / If-None-Match に対応）。
 * - アプリを通らない変更（自動採点・マイグレーション・審査）は寿命（1日）で拾う。
 *   自分の表示名が、いいね・コメントのついでの upsert_app_user で変わる分（未カスタマイズの名前だけ）も寿命で拾う。
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

type ReadResult = {
  ok: boolean;
  exists: boolean;
  etag: string | null;
  snapshot: UserSnapshot | null;
  /** ロックなら期限内の印（空ならだれも書き込み中でない）。ロックでなければ null */
  holders: Record<string, number> | null;
};

async function readObject(store: R2StorageAdapter, publicUserId: string): Promise<ReadResult> {
  try {
    const object = await store.getText(userSnapshotKey(publicUserId), R2_READ_TIMEOUT_MS);
    if (!object) return { ok: true, exists: false, etag: null, snapshot: null, holders: null };
    return {
      ok: true,
      exists: true,
      etag: object.etag,
      // 古い・別の版・ロックは null（＝作り直す）
      snapshot: parseUserSnapshot(object.body, publicUserId),
      holders: parseUserSnapshotLock(object.body, publicUserId),
    };
  } catch (error) {
    console.warn('[user-snapshot] read failed; reading from the DB:', error);
    return { ok: false, exists: false, etag: null, snapshot: null, holders: null };
  }
}

/** 読んだときの状態が変わっていなければ書く。変わっていたら false。ETag が取れなければ書かない */
async function putIfUnchanged(store: R2StorageAdapter, read: ReadResult, publicUserId: string, value: unknown): Promise<boolean> {
  const key = userSnapshotKey(publicUserId);
  const body = JSON.stringify(value);
  if (read.exists) {
    if (!read.etag) return false;
    return store.putTextIf(key, body, { contentType: CONTENT_TYPE, timeoutMs: R2_WRITE_TIMEOUT_MS, ifMatch: read.etag });
  }
  return store.putTextIf(key, body, { contentType: CONTENT_TYPE, timeoutMs: R2_WRITE_TIMEOUT_MS, ifNoneMatch: '*' });
}

const lockBody = (publicUserId: string, holders: Record<string, number>): UserSnapshotLock => ({
  v: USER_SNAPSHOT_VERSION,
  lock: true,
  publicUserId,
  holders,
});

/**
 * 公開スタンプ帳のデータ。R2 にあればそれ、無い・古い・読めないときは DB から作って置いておく。
 * 書き込み中のロックがあるときは DB から読むだけで置かない。
 * 利用者がいなければ null。1リクエストの中ではページ本文・generateMetadata・OGP で使い回す。
 */
export const loadUserSnapshot = cache(async (publicUserId: string): Promise<UserSnapshot | null> => {
  const raw = publicUserId.trim();
  if (!raw) return null;
  const id = normalizeSnapshotUserId(raw);
  const store = id ? snapshotStore() : null;
  // UUID でない ID は今までどおり DB に渡す（DB が null かエラーを返す）
  if (!id || !store) return (await buildUserSnapshot(id ?? raw))?.snapshot ?? null;

  const read = await readObject(store, id);
  if (read.snapshot) return read.snapshot;

  const built = await buildUserSnapshot(id);
  if (!built) return null;
  const locked = read.holders !== null && Object.keys(read.holders).length > 0;
  // 読み出しに失敗したとき（そこにある版が分からない）・書き込み中のときは書かない
  if (built.complete && read.ok && !locked) {
    try {
      await putIfUnchanged(store, read, id, built.snapshot);
    } catch (error) {
      console.warn('[user-snapshot] write failed:', error);
    }
  }
  return built.snapshot;
});

const RESOLVE_TIMEOUT_MS = 1500;
/** 書き込みのあとの作り直しにかける時間の上限。超えたらやめる（ロックは期限で切れる） */
const UNLOCK_TIMEOUT_MS = 4000;

/**
 * 本人の公開ID（app_user.id）。get_public_user_ids は公開訪問が0件になった人を返さないので使わない
 * （最後の1件を非公開にしたときに引けない）。失敗・時間切れは undefined、本人の行が無ければ null。
 */
async function resolveOwnPublicUserId(supabase: SupabaseClient<any>): Promise<string | null | undefined> {
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
  return undefined;
}

export type OwnSnapshotLock =
  | { ok: true; publicUserId: string | null; nonce: string | null }
  | { ok: false };

/**
 * 本人の書き込みが DB を変える直前に呼ぶ（認証・入力の確認が済んでから）。
 * ok: false なら書き込みをしないで 503 を返すこと（ロックを置けないまま非公開にすると、古い JSON が残り得る）。
 * 本人の app_user がまだ無い人（初めての投稿など）は公開スタンプ帳も JSON も無いので、ロック無しで ok。
 */
export async function lockOwnSnapshot(supabase: SupabaseClient<any>): Promise<OwnSnapshotLock> {
  const store = snapshotStore();
  if (!store) return { ok: true, publicUserId: null, nonce: null };
  const publicUserId = await resolveOwnPublicUserId(supabase);
  if (publicUserId === undefined) return { ok: false };
  if (publicUserId === null) return { ok: true, publicUserId: null, nonce: null };

  const nonce = crypto.randomUUID();
  try {
    for (let i = 0; i < 3; i += 1) {
      const read = await readObject(store, publicUserId);
      if (!read.ok) break;
      const holders = { ...(read.holders ?? {}), [nonce]: Date.now() + USER_SNAPSHOT_LOCK_MS };
      if (await putIfUnchanged(store, read, publicUserId, lockBody(publicUserId, holders))) {
        return { ok: true, publicUserId, nonce };
      }
    }
  } catch (error) {
    console.warn('[user-snapshot] lock failed:', error);
  }
  console.error('[user-snapshot] could not lock the snapshot; refusing the write');
  return { ok: false };
}

/**
 * 本人の書き込みのあとに呼ぶ（成功・失敗どちらでも）。例外は投げない。
 * ほかにロック中の人がいなければ今の DB から作り直して置き換える。いれば自分の印だけ外す。
 * 失敗・時間切れならロックはそのまま期限で切れる（その後の表示が DB の変更後の内容で作り直す）。
 */
export async function unlockOwnSnapshot(lock: OwnSnapshotLock): Promise<void> {
  const store = snapshotStore();
  if (!store || !lock.ok || !lock.publicUserId || !lock.nonce) return;
  const { publicUserId, nonce } = lock;

  const attempt = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) {
      const read = await readObject(store, publicUserId);
      if (!read.ok) return;
      const others = { ...(read.holders ?? {}) };
      delete others[nonce];
      if (Object.keys(others).length > 0) {
        // ほかの書き込みがまだ途中。作り直しは最後に終わる人に任せ、自分の印だけ外す
        if (await putIfUnchanged(store, read, publicUserId, lockBody(publicUserId, others))) return;
        continue;
      }
      // ロックが自分の印だけ（または自分の印がもう期限切れ）。R2 を読んだあとに DB を読むので、
      // 書き込みの後の内容になる。その間にほかの人がロックを置いたら ETag が変わって書けない
      const built = await buildUserSnapshot(publicUserId);
      const next = built?.complete ? built.snapshot : lockBody(publicUserId, {});
      if (await putIfUnchanged(store, read, publicUserId, next)) return;
    }
  };

  try {
    await withTimeout(attempt(), UNLOCK_TIMEOUT_MS, 'snapshot unlock');
  } catch (error) {
    console.warn('[user-snapshot] unlock failed; the lock expires by itself:', error);
  }
}
