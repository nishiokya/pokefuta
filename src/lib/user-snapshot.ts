import 'server-only';
import { cache } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { R2StorageAdapter } from '@/lib/storage/r2';
import { loadPublicVisitStats } from '@/lib/public-visit-stats';
import {
  USER_SNAPSHOT_CARD_LIMIT,
  USER_SNAPSHOT_VERSION,
  isSnapshotUserId,
  parseUserSnapshot,
  userSnapshotKey,
  type SnapshotCardRow,
  type SnapshotProfileRow,
  type SnapshotProgressRow,
  type UserSnapshot,
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
 * - 本人の書き込み（投稿・訪問の編集/削除・まとめて公開・写真の削除・プロフィール・アイコン）の直後に
 *   refreshOwnUserSnapshot() で作り直す。
 * - 書き戻しは条件つき（読んだときの ETag / 無いときだけ）。DB を読んでから書くまでの間に
 *   別の書き込みが入っていたら書かない。古い内容で新しい内容を上書きしない。
 * - 作り直せなかったら消す。次の表示は DB から読む。
 * - アプリを通らない変更（自動採点・マイグレーション）は寿命（1日）で拾う。
 *
 * JSON は R2 のバケット内で非公開（公開 URL を作らない）。サーバーが S3 API で読むだけ。
 */

const R2_READ_TIMEOUT_MS = 1500;
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

type Built = { snapshot: UserSnapshot; complete: boolean };

/**
 * DB から作る。利用者がいなければ null。プロフィール・訪問の読み出しの失敗は例外（ページは今までどおり 500）。
 * 件数・アイコンの失敗は 0 / なしで表示を続けるが、complete=false にして保存しない。
 */
async function buildUserSnapshot(publicUserId: string): Promise<Built | null> {
  const client = liveClient();
  if (!client) throw new Error('Supabase client is not configured');

  const [profileResult, avatar, cardsResult, progressResult, stats, designManhole, plush, snow] = await Promise.all([
    client.rpc('get_public_profile' as never, { p_user_id: publicUserId } as never),
    avatarRpc(client, publicUserId),
    client
      .from('public_user_visit_card')
      .select(
        'id, manhole_id, shot_at, comment, created_at,' +
        ' manhole_title, manhole_prefecture, manhole_municipality, manhole_pokemons,' +
        ' latest_photo_id, latest_photo_is_landscape, latest_photo_ai_tags'
      )
      .eq('public_user_id', publicUserId)
      .order('shot_at', { ascending: false })
      .limit(USER_SNAPSHOT_CARD_LIMIT),
    client
      .from('public_user_visit_card')
      .select(
        'manhole_id, shot_at, created_at, manhole_prefecture,' +
        ' latest_photo_id, latest_photo_created_at, latest_photo_is_landscape'
      )
      .eq('public_user_id', publicUserId)
      .not('manhole_id', 'is', null),
    loadPublicVisitStats(client, publicUserId),
    countRpc(client, 'get_public_design_manhole_count', publicUserId),
    countRpc(client, 'get_public_plush_visit_count', publicUserId),
    countRpc(client, 'get_public_snow_visit_count', publicUserId),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = (profileResult.data as SnapshotProfileRow[] | null)?.[0] ?? null;
  if (!profile) return null;
  if (cardsResult.error) throw new Error(cardsResult.error.message);
  if (progressResult.error) throw new Error(progressResult.error.message);

  const snapshot: UserSnapshot = {
    v: USER_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    publicUserId,
    profile,
    avatarPhotoId: avatar ?? null,
    cards: (cardsResult.data || []) as unknown as SnapshotCardRow[],
    progressRows: (progressResult.data || []) as unknown as SnapshotProgressRow[],
    stats,
    counts: { designManhole: designManhole ?? 0, plush: plush ?? 0, snow: snow ?? 0 },
  };
  const complete = avatar !== undefined && designManhole !== null && plush !== null && snow !== null;
  return { snapshot, complete };
}

type ReadResult = { snapshot: UserSnapshot | null; etag: string | null; exists: boolean; ok: boolean };

async function readSnapshot(store: R2StorageAdapter, publicUserId: string): Promise<ReadResult> {
  try {
    const object = await store.getText(userSnapshotKey(publicUserId), R2_READ_TIMEOUT_MS);
    if (!object) return { snapshot: null, etag: null, exists: false, ok: true };
    return {
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

/** 読んだときの状態が変わっていなければ書く。変わっていたら何もしない（新しい方を残す） */
async function writeIfUnchanged(store: R2StorageAdapter, read: ReadResult, built: Built): Promise<boolean> {
  const key = userSnapshotKey(built.snapshot.publicUserId);
  const body = JSON.stringify(built.snapshot);
  if (read.exists) {
    // ETag が取れないと条件をつけられないので書かない
    if (!read.etag) return false;
    return store.putTextIf(key, body, { contentType: CONTENT_TYPE, ifMatch: read.etag });
  }
  return store.putTextIf(key, body, { contentType: CONTENT_TYPE, ifNoneMatch: '*' });
}

/**
 * 公開スタンプ帳のデータ。R2 にあればそれ、無い・古い・読めないときは DB から作って置いておく。
 * 利用者がいなければ null。1リクエストの中ではページ本文・generateMetadata・OGP で使い回す。
 */
export const loadUserSnapshot = cache(async (publicUserId: string): Promise<UserSnapshot | null> => {
  const id = publicUserId.trim();
  if (!id) return null;
  const store = isSnapshotUserId(id) ? snapshotStore() : null;
  if (!store) return (await buildUserSnapshot(id))?.snapshot ?? null;

  const read = await readSnapshot(store, id);
  if (read.snapshot) return read.snapshot;

  const built = await buildUserSnapshot(id);
  if (!built) return null;
  // 読み出しに失敗したときは、そこにある版が分からないので書かない
  if (built.complete && read.ok) {
    try {
      await writeIfUnchanged(store, read, built);
    } catch (error) {
      console.warn('[user-snapshot] write failed:', error);
    }
  }
  return built.snapshot;
});

/**
 * 本人の書き込みのあとに呼ぶ。その人のスナップショットを今の DB から作り直す。
 * 作り直せなかったら消す（古い JSON を残さない）。失敗しても例外は投げない（書き込み自体は成功している）。
 *
 * supabase は書き込みに使ったログイン中のクライアント。公開IDは get_own_profile で引く
 * （get_public_user_ids は公開訪問が0件になった人を返さないので、最後の1件を非公開にしたときに引けない）。
 */
export async function refreshOwnUserSnapshot(supabase: SupabaseClient<any>): Promise<void> {
  const store = snapshotStore();
  if (!store) return;

  let publicUserId: string | null = null;
  try {
    const { data, error } = await supabase.rpc('get_own_profile' as never);
    if (error) throw error;
    const row = ((data as unknown as { public_user_id?: string | null }[] | null) || [])[0];
    publicUserId = row?.public_user_id ?? null;
  } catch (error) {
    console.error('[user-snapshot] could not resolve own public id; snapshot may be stale for up to a day:', error);
    return;
  }
  if (!publicUserId || !isSnapshotUserId(publicUserId)) return;

  const key = userSnapshotKey(publicUserId);
  // 2回まで: 1回目の間にほかの書き込み（同じ人のまとめて投稿など）が先に書いたら、読み直して作り直す
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const read = await readSnapshot(store, publicUserId);
      if (!read.ok) break;
      const built = await buildUserSnapshot(publicUserId);
      if (!built) {
        if (read.exists) await store.delete(key);
        return;
      }
      if (!built.complete) break;
      if (await writeIfUnchanged(store, read, built)) return;
    } catch (error) {
      console.warn('[user-snapshot] refresh failed:', error);
      break;
    }
  }

  // 作り直せなかった。古い JSON が配られ続けないよう消す（次の表示は DB から読んで作る）
  try {
    await store.delete(key);
  } catch (error) {
    console.error('[user-snapshot] could not delete a stale snapshot; it may be served for up to a day:', error);
  }
}
