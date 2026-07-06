import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authCookieOptions } from './cookies';

// ==========================================
// Server Component用クライアント
// ==========================================
// Server Component ではクッキーを書けないため setAll は無視する
// （セッションのリフレッシュは middleware が担う）。
export const createServerClient = () => {
  const cookieStore = cookies();

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server Component からは書き込み不可
        },
      },
    }
  );
};
