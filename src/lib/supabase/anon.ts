import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * クッキーを読まない・書かない anon クライアント。
 *
 * `Cache-Control: public` を付ける（CDN に共有キャッシュさせる）応答は、必ずこれで読む。
 * createRouteHandlerClient はリクエストのクッキーに束縛されていて、アクセストークンが
 * 切れかけていると読み出しのついでにセッションを更新し、応答に Set-Cookie を書く。
 * その応答を CloudFront が共有キャッシュすると、**次に同じURLを開いた別人の
 * ブラウザにそのユーザーのセッションが配られ、その人として投稿できてしまう**
 * （2026-09-26、他人の投稿が本人のアカウント名義で保存された）。
 */
export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
