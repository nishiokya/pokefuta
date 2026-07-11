import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Ensures that an app_user record exists for the given auth user.
 * Uses UPSERT to avoid race conditions with concurrent requests.
 * Silently logs errors without throwing to allow operations to proceed.
 *
 * @param supabase - Supabase client (server or browser)
 * @param userId - Auth user ID (auth.uid())
 * @param displayName - Optional display_name from user metadata
 */
export async function ensureAppUser(
  supabase: SupabaseClient<any>,
  userId: string,
  displayName?: string
): Promise<void> {
  try {
    const trimmedName = displayName?.trim() || null;

    // display_name がある場合は既存行も更新して auth metadata と同期する。
    // ない場合は DO NOTHING で既存の名前を守る。
    const { error } = await (supabase as any)
      .from('app_user')
      .upsert(
        { auth_uid: userId, display_name: trimmedName },
        { onConflict: 'auth_uid', ignoreDuplicates: !trimmedName }
      );

    if (error) {
      console.error('Error ensuring app_user:', error);
    }
  } catch (error) {
    console.error('Unexpected error in ensureAppUser:', error);
  }
}
