import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// ==========================================
// Server Component用クライアント
// ==========================================
export const createServerClient = () => {
  return createServerComponentClient({ cookies });
};
