import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { authCookieOptions } from './cookies';

// @supabase/auth-helpers-nextjs（非推奨）から @supabase/ssr へ移行済み。
// クッキーは authCookieOptions（本番: Domain=.pokefuta.com）で発行され、
// data.pokefuta.com とセッションを共有する。
// 既存呼び出し側との互換のため createRouteHandlerClient({ cookies }) の
// シグネチャを維持している（引数は未使用）。
export function createRouteHandlerClient(
  _context?: { cookies: typeof cookies }
): SupabaseClient<Database> {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Server Component などクッキーを書けない文脈で呼ばれた場合。
            // Route Handler で失敗すると Set-Cookie が反映されずログイン
            // 状態が壊れる手掛かりになるため、握りつぶさずログに残す
            // （セッションのリフレッシュ自体は middleware が担う）。
            console.error(
              `Failed to set auth cookies (${cookiesToSet.map((c) => c.name).join(', ')}):`,
              error
            );
          }
        },
      },
    }
  ) as unknown as SupabaseClient<Database>;
}

/**
 * リクエストに Supabase の認証クッキーが載っているか。
 *
 * 載っているリクエストは createRouteHandlerClient がセッション更新の Set-Cookie を
 * 書きうるので、その応答に `Cache-Control: public` を付けてはいけない
 * （CDN が Set-Cookie ごと共有キャッシュし、別人にセッションが渡る）。
 * getSession() の結果（viewerUserId）では判定しない。更新に失敗したときは
 * viewer が null のまま「クッキーを消す」Set-Cookie が書かれ、それが共有されると
 * 同じURLを開いた人が全員ログアウトされる。
 */
export function hasSupabaseAuthCookie(): boolean {
  return cookies()
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));
}
