import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ensures that an app_user record exists for the given auth user.
 * Uses UPSERT to avoid race conditions with concurrent requests.
 *
 * @param supabase - Supabase client (server or browser)
 * @param userId - Auth user ID (auth.uid())
 * @param email - Optional email for display_name fallback
 * @returns boolean - true if successful, false if error occurred
 */
export async function ensureAppUser(
  supabase: SupabaseClient<any>,
  userId: string,
  email?: string
): Promise<boolean> {
  try {
    // UPSERT: 存在しなければ作成、存在すればスキップ（原子的な操作）
    // これによって race condition を回避
    const { error } = await supabase
      .from('app_user')
      .upsert({
        auth_uid: userId,
        display_name: email?.split('@')[0] || 'User',
        email: email || null
      }, {
        onConflict: 'auth_uid'  // auth_uid で競合判定
      });

    if (error) {
      console.error('Error ensuring app_user:', error);
      // Don't throw - allow operation to proceed even if app_user creation fails
      return false;
    }

    return true;
  } catch (error) {
    console.error('Unexpected error in ensureAppUser:', error);
    return false;
  }
}
