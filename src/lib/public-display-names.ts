import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type PublicDisplayNameRow = {
  auth_uid: string;
  display_name: string | null;
};

type PublicUserIdRow = {
  auth_uid: string;
  public_user_id: string | null;
};

export async function loadPublicDisplayNameMap(
  supabase: SupabaseClient<Database>,
  authUids: string[]
): Promise<Map<string, string | null>> {
  const uniqueAuthUids = Array.from(
    new Set(authUids.filter((id): id is string => typeof id === 'string' && id.length > 0))
  );
  const displayNameMap = new Map<string, string | null>();

  if (uniqueAuthUids.length === 0) {
    return displayNameMap;
  }

  const { data, error } = await supabase.rpc(
    'get_public_display_names' as never,
    { p_auth_uids: uniqueAuthUids } as never
  );

  if (error) {
    console.warn('Failed to load public display names:', error);
    return displayNameMap;
  }

  ((data || []) as PublicDisplayNameRow[]).forEach((user) => {
    if (user?.auth_uid) {
      displayNameMap.set(user.auth_uid, user.display_name ?? null);
    }
  });

  return displayNameMap;
}

/**
 * auth uid → public_user_id（`app_user.id`、公開URL用のID）。
 *
 * `app_user.id` への直接 SELECT 権限は無いので RPC で解決する。
 * 返す条件は `get_public_display_names` と揃えてある（公開visitあり OR 蓋コメントあり）ので、
 * **表示名が出る人には必ず public_user_id も出る**。片方だけ変えると
 * 「名前は出るのにプロフィールへリンクできない」非対称が復活する。
 *
 * RPC が失敗してもエンドポイント全体を落とさない。リンク先が無いだけで
 * 名前とコメント本文は表示できるため、握りつぶす価値がある数少ない箇所。
 */
export async function loadPublicUserIdMap(
  supabase: SupabaseClient<Database>,
  authUids: string[]
): Promise<Map<string, string>> {
  const uniqueAuthUids = Array.from(
    new Set(authUids.filter((id): id is string => typeof id === 'string' && id.length > 0))
  );
  const publicUserIdMap = new Map<string, string>();

  if (uniqueAuthUids.length === 0) {
    return publicUserIdMap;
  }

  const { data, error } = await supabase
    .rpc('get_public_user_ids' as never, { p_auth_uids: uniqueAuthUids } as never)
    .then(
      (result: any) => result,
      (err: any) => ({ data: null, error: err })
    );

  if (error) {
    console.warn('Failed to load public_user_id via get_public_user_ids RPC:', error);
    return publicUserIdMap;
  }

  ((data || []) as PublicUserIdRow[]).forEach((user) => {
    if (user?.auth_uid && user.public_user_id) {
      publicUserIdMap.set(user.auth_uid, user.public_user_id);
    }
  });

  return publicUserIdMap;
}
