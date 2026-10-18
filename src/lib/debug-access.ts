import { createRouteHandlerClient } from '@/lib/supabase/route-handler';

/**
 * 開発者向けの検証ページ・API を開けるログイン中の利用者か。
 *
 * 許可する auth UID は環境変数 `POKEFUTA_DEBUG_USER_IDS`（カンマ区切り）にだけ置き、
 * リポジトリには書かない（公開リポジトリに auth UID を出さない決まり）。
 * 未設定なら誰も通さない。判定は getSession() ではなく、トークンを Auth サーバーで
 * 検証する getUser() で行う。
 */
export async function isDebugUser(): Promise<boolean> {
  const allowed = (process.env.POKEFUTA_DEBUG_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (allowed.length === 0) return false;

  const supabase = createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user && allowed.includes(user.id);
}
