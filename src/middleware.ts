import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authCookieOptions } from '@/lib/supabase/cookies';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Supabase環境変数が設定されていない場合は認証チェックをスキップ
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return res;
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookieOptions: authCookieOptions,
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              res.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // セッション更新
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // 認証が必要なページへのアクセス
    // upload ページは認証必須
    // visits ページはプレビューモードがあるため未認証でもアクセス可能
    const protectedPaths = ['/upload'];
    const isProtectedPath = protectedPaths.some(path => req.nextUrl.pathname.startsWith(path));

    if (!session && isProtectedPath) {
      const redirectUrl = new URL('/login', req.url);
      redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    return res;
  }
}

export const config = {
  matcher: ['/upload/:path*'],
};
