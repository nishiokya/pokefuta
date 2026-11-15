'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import { countDistinctManholes, ownRegularTier, type RegularTier } from '@/lib/regular-badges';

/**
 * ログイン中の本人の称号を、その場の公開訪問の枚数から決める。
 *
 * 名前の横の札は regulars.json（tracker が1日1回作る）を読むので、訪問した日は前の段のまま。
 * 本人だけはスタンプ帳（MyBadgesPanel）で今の段が見えているので、自分の札がずれて見える。
 * そこで本人の札だけブラウザから Supabase に直接聞いて上書きする（Amplify の SSR は通さない）。
 * 他人の札は日次のまま（人数分を毎回数えると重いため）。
 *
 * 本人の公開ID（get_own_profile）は札が1つでもあれば取り、枚数（公開ビューの manhole_id）は
 * その人の札がページにあるときだけ取る。どちらも1ページで1回、少し経ったら取り直す
 * （同じタブで訪問を足してから別のページへ移ったときに反映するため）。
 */

const TTL_MS = 60_000;
const PAGE_SIZE = 1000;

type Cached<T> = { key: string; at: number; promise: Promise<T> };
let ownId: Cached<string | null> | null = null;
let ownTier: Cached<RegularTier | null | undefined> | null = null;

const fresh = <T>(c: Cached<T> | null, key: string): c is Cached<T> => Boolean(c && c.key === key && Date.now() - c.at < TTL_MS);

async function sessionUserId(client: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await client.auth.getSession();
  return session?.user?.id ?? null;
}

/** ログイン中なら本人の公開ID、未ログイン・取れないときは null */
export async function loadOwnPublicUserId(): Promise<string | null> {
  try {
    const client = createBrowserClient() as unknown as SupabaseClient;
    const authId = await sessionUserId(client);
    if (!authId) {
      ownId = null;
      ownTier = null;
      return null;
    }
    if (!fresh(ownId, authId)) {
      ownId = {
        key: authId,
        at: Date.now(),
        promise: Promise.resolve(client.rpc('get_own_profile'))
          .then(({ data, error }) => {
            if (error) return null;
            const id = (data as { public_user_id?: unknown }[] | null)?.[0]?.public_user_id;
            return typeof id === 'string' && id ? id : null;
          })
          .catch(() => null),
      };
    }
    return await ownId.promise;
  } catch {
    return null;
  }
}

async function countOwnPublicManholes(client: SupabaseClient, publicUserId: string): Promise<number | undefined> {
  const rows: { manhole_id: number | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('public_user_visit_base')
      .select('manhole_id')
      .eq('public_user_id', publicUserId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return undefined;
    const page = (data ?? []) as { manhole_id: number | null }[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return countDistinctManholes(rows);
}

/**
 * 本人（publicUserId）のその場の段。段が無ければ null、数えられなかったら undefined
 * （undefined のときは呼び出し側が regulars.json の段をそのまま使う）。
 */
export function loadOwnRegularTier(publicUserId: string): Promise<RegularTier | null | undefined> {
  if (!fresh(ownTier, publicUserId)) {
    let client: SupabaseClient;
    try {
      client = createBrowserClient() as unknown as SupabaseClient;
    } catch {
      return Promise.resolve(undefined);
    }
    ownTier = {
      key: publicUserId,
      at: Date.now(),
      promise: countOwnPublicManholes(client, publicUserId)
        .then((count) => (count === undefined ? undefined : ownRegularTier(publicUserId, count)))
        .catch(() => undefined),
    };
  }
  return ownTier.promise;
}
