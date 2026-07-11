import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Ensures that an app_user record exists for the given auth user.
 * Uses upsert_app_user() SQL function to avoid write amplification:
 * only writes when display_name is actually different (IS DISTINCT FROM).
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
    const { error } = await (supabase as any).rpc('upsert_app_user', {
      p_auth_uid: userId,
      p_display_name: trimmedName,
    });
    if (error) {
      console.error('Error ensuring app_user:', error);
    }
  } catch (error) {
    console.error('Unexpected error in ensureAppUser:', error);
  }
}
