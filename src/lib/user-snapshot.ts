import 'server-only';
import { cache } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { R2StorageAdapter } from '@/lib/storage/r2';
import {
  type UserSnapshot,
  isSnapshotRev,
  normalizeSnapshotUserId,
  parseUserSnapshot,
  snapshotFromDb,
  userSnapshotKey,
} from '@/lib/user-snapshot-format';

/**
 * 公開スタンプ帳のスナップショット（公開IDごとの JSON を R2 に置く）。
 *
 * なぜ: /users/[userId] は1回の表示でプロフィール・訪問カード・県別・件数3種・アイコンと
 * 約8本 Supabase を呼んでいた。Supabase の応答は中身のほかにヘッダが1本あたり約1.2KB つき、
 * egress の大半が「本数」から来ていた（2026-11-24 の edge_logs）。
 *
 * 鮮度（非公開に戻した訪問・フレンド募集 OFF が残らないこと）は DB の版（rev）で守る:
 * - visit / photo / app_user / design_manhole の変更は、同じトランザクションで DB の変更ログに記録される
 *   （supabase/migrations/20261125120000_user_snapshot_change_log.sql）。アプリを通らない運用 SQL・
 *   マイグレーション・自動採点・審査も拾う。
 * - 表示のたびに get_public_snapshot_rev（1本、毎回 DB から）で今の版を読み、JSON の版と同じときだけ JSON を使う。
 *   違えば get_public_user_snapshot（1本）で作り直す。版とデータは DB の1つの文で同じ時点から読むので、
 *   遅れて置かれた古い JSON も版が合わずに使われない。
 * - 版が読めないとき（Supabase の障害・時間切れ）は JSON を使わない（鮮度を確かめられない）。
 * - 書き込み（投稿・削除・プロフィール保存など）は R2 に触れない。R2 が止まっても表示が DB 読みに戻るだけ。
 * - 切り戻し: 環境変数 USER_SNAPSHOT_R2=off で R2 を読まず書かず、毎回 get_public_user_snapshot（1本）で読む。
 * - 蓋のカタログ（名称・県）の変更は版に入れていないので、JSON の寿命（1日）で拾う。
 *
 * JSON は R2 のバケット内で非公開（公開 URL を作らない）。サーバーが S3 API で読むだけ。
 */

const R2_READ_TIMEOUT_MS = 1500;
const R2_WRITE_TIMEOUT_MS = 2000;
const REV_TIMEOUT_MS = 3000;
const CONTENT_TYPE = 'application/json; charset=utf-8';

let adapter: R2StorageAdapter | null | undefined;
function snapshotStore(): R2StorageAdapter | null {
  if (process.env.USER_SNAPSHOT_R2 === 'off') return null;
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
function liveClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase client is not configured');
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

/** 今の版。公開ID が無ければ null、読めなければ undefined */
async function fetchRev(client: SupabaseClient<Database>, publicUserId: string): Promise<string | null | undefined> {
  try {
    const { data, error } = await withTimeout(
      Promise.resolve(client.rpc('get_public_snapshot_rev' as never, { p_user_id: publicUserId } as never)),
      REV_TIMEOUT_MS,
      'get_public_snapshot_rev',
    );
    if (error) throw new Error(error.message);
    if (data === null) return null;
    if (isSnapshotRev(data)) return data;
    throw new Error('get_public_snapshot_rev returned an unexpected value');
  } catch (error) {
    console.warn('[user-snapshot] rev failed; not using the cached JSON:', error);
    return undefined;
  }
}

/** DB から1本で作る（版とデータが同じ時点）。公開ID が無ければ null。失敗は例外 */
async function fetchSnapshot(client: SupabaseClient<Database>, publicUserId: string): Promise<UserSnapshot | null> {
  const { data, error } = await client.rpc('get_public_user_snapshot' as never, { p_user_id: publicUserId } as never);
  if (error) throw new Error(error.message);
  return snapshotFromDb(data, publicUserId);
}

type ReadResult = { ok: boolean; exists: boolean; etag: string | null; snapshot: UserSnapshot | null };

async function readObject(store: R2StorageAdapter, publicUserId: string): Promise<ReadResult> {
  try {
    const object = await store.getText(userSnapshotKey(publicUserId), R2_READ_TIMEOUT_MS);
    if (!object) return { ok: true, exists: false, etag: null, snapshot: null };
    // 古い・別の版の形・壊れたものは null（＝作り直す）
    return { ok: true, exists: true, etag: object.etag, snapshot: parseUserSnapshot(object.body, publicUserId) };
  } catch (error) {
    console.warn('[user-snapshot] read failed; reading from the DB:', error);
    return { ok: false, exists: false, etag: null, snapshot: null };
  }
}

/**
 * 読んだときの状態が変わっていなければ置く（ETag が同じ / 無かったときだけ）。
 * ほかの表示が先に置いていたら置かない（どちらが新しいかは次の表示が版で判定する）。
 */
async function putIfUnchanged(store: R2StorageAdapter, read: ReadResult, snapshot: UserSnapshot): Promise<void> {
  if (!read.ok) return; // 読めなかった（そこにある版が分からない）
  const key = userSnapshotKey(snapshot.publicUserId);
  const body = JSON.stringify(snapshot);
  try {
    if (read.exists) {
      if (!read.etag) return;
      await store.putTextIf(key, body, { contentType: CONTENT_TYPE, timeoutMs: R2_WRITE_TIMEOUT_MS, ifMatch: read.etag });
    } else {
      await store.putTextIf(key, body, { contentType: CONTENT_TYPE, timeoutMs: R2_WRITE_TIMEOUT_MS, ifNoneMatch: '*' });
    }
  } catch (error) {
    console.warn('[user-snapshot] write failed:', error);
  }
}

/**
 * 公開スタンプ帳のデータ。利用者がいなければ null。
 * ページ（Server Component）では React の cache で1リクエスト1回になる。Route Handler では cache が効かないので、
 * 入口で1回呼んで同じオブジェクトを使い回すこと（...FromSnapshot の関数に渡す）。
 */
export const loadUserSnapshot = cache(async (publicUserId: string): Promise<UserSnapshot | null> => {
  // 公開ID は UUID。それ以外は DB に聞くまでもなく利用者がいない
  const id = normalizeSnapshotUserId(publicUserId);
  if (!id) return null;

  const client = liveClient();
  const store = snapshotStore();
  if (!store) return fetchSnapshot(client, id);

  const [read, rev] = await Promise.all([readObject(store, id), fetchRev(client, id)]);
  if (rev === null) return null; // 404。1本で終わる
  if (rev !== undefined && read.snapshot && read.snapshot.rev === rev) return read.snapshot;

  const snapshot = await fetchSnapshot(client, id);
  // 置く版は、データと同じ時点で読んだ snapshot.rev（先に読んだ rev ではない）
  if (snapshot) await putIfUnchanged(store, read, snapshot);
  return snapshot;
});
