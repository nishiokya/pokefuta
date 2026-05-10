import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ensures that an app_user record exists for the given auth user.
 * Creates it automatically if missing.
 *
 * @param supabase - Supabase client (server or browser)
 * @param userId - Auth user ID (auth.uid())
 * @param email - Optional email for display_name fallback
 * @returns boolean - true if user exists or was created successfully, false if error occurred
 */
export async function ensureAppUser(
  supabase: SupabaseClient<any>,
  userId: string,
  email?: string
): Promise<boolean> {
  try {
    // Check if app_user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('app_user')
      .select('id')
      .eq('auth_uid', userId)
      .single();

    // If error is PGRST116 (no rows), it's expected for new users
    if (checkError && checkError.code !== 'PGRST116') {
      console.warn('Error checking app_user:', checkError);
      return false;
    }

    // User already exists
    if (existingUser) {
      return true;
    }

    // Create missing app_user
    console.log('Creating missing app_user for:', userId);
    const { error: createError } = await supabase
      .from('app_user')
      .insert({
        auth_uid: userId,
        display_name: email?.split('@')[0] || 'User',
        email: email || null
      });

    if (createError) {
      console.error('Failed to create app_user:', createError);
      // Don't throw - allow operation to proceed even if app_user creation fails
      // (especially for non-critical operations like likes/bookmarks)
      return false;
    }

    console.log('Successfully created app_user:', userId);
    return true;
  } catch (error) {
    console.error('Unexpected error in ensureAppUser:', error);
    return false;
  }
}
