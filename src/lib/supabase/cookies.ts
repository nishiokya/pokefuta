import type { CookieOptionsWithName } from '@supabase/ssr';

// ==========================================
// 認証クッキーの共通オプション
// ==========================================
// data.pokefuta.com（GitHub Pages 側）とセッションを共有するため、
// 本番ではクッキーを親ドメイン (.pokefuta.com) スコープで発行する。
// ローカル開発では domain を付けない（localhost に domain 指定を
// 付けるとブラウザがクッキーを保存しない）。
// 空文字・空白のみの環境変数は未指定として扱う
const envCookieDomain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();

export const authCookieOptions: CookieOptionsWithName = {
  domain:
    envCookieDomain ||
    (process.env.NODE_ENV === 'production' ? '.pokefuta.com' : undefined),
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};
