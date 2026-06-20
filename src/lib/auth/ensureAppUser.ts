import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Ensures that an app_user record exists for the given auth user.
 * Uses UPSERT to avoid race conditions with concurrent requests.
 * Silently logs errors without throwing to allow operations to proceed.
 *
 * @param supabase - Supabase client (server or browser)
 * @param userId - Auth user ID (auth.uid())
 * @param email - Optional email for display_name fallback
 * @param displayName - Optional display_name from user metadata (preferred over email-derived name)
 */
export async function ensureAppUser(
  supabase: SupabaseClient<any>,
  userId: string,
  email?: string,
  displayName?: string
): Promise<void> {
  try {
    // UPSERT with ignoreDuplicates: 存在しなければ作成、存在すればスキップ（原子的な操作）
    // これによって race condition を回避＋既存データの上書きを防ぐ
    const { error } = await (supabase as any)
      .from('app_user')
      .upsert(
        {
          auth_uid: userId,
          display_name: displayName || null
        },
        {
          onConflict: 'auth_uid',
          ignoreDuplicates: true  // DO NOTHING 相当：既存データを更新しない
        }
      );

    if (error) {
      console.error('Error ensuring app_user:', error);
      // Don't throw - allow operation to proceed even if app_user creation fails
      return;
    }
  } catch (error) {
    console.error('Unexpected error in ensureAppUser:', error);
    // Don't throw - allow operation to proceed
  }
}
