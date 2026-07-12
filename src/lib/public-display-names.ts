import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type PublicDisplayNameRow = {
  auth_uid: string;
  display_name: string | null;
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
