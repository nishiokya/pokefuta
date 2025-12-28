import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/database';

const ONBOARDING_PATH = '/onboarding/first-upload';
const AUTH_PAGES = ['/login', '/signup'];
const PROTECTED_PATHS = ['/upload', '/visits'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // Supabase環境変数が設定されていない場合は認証チェックをスキップ
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return res;
  }

  try {
    const supabase = createMiddlewareClient<Database>({ req, res });

    // セッション更新
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const isProtectedPath = PROTECTED_PATHS.some(path => pathname.startsWith(path));

    if (!session && isProtectedPath) {
      const redirectUrl = new URL('/login', req.url);
      redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // 初回オンボーディングチェック
    const isApiRoute = pathname.startsWith('/api');
    const isAuthPage = AUTH_PAGES.some(path => pathname.startsWith(path));

    if (session && !isApiRoute && !isAuthPage) {
      const { data: profile, error: profileError } = await supabase
        .from('app_user')
        .select('has_uploaded_image')
        .eq('auth_uid', session.user.id)
        .single();

      if (profileError) {
        console.warn('Failed to read onboarding state:', profileError.message);
      }

      const hasUploadedImage = profile?.has_uploaded_image ?? false;
      const isOnboardingPath = pathname.startsWith(ONBOARDING_PATH);

      if (!hasUploadedImage && !isOnboardingPath) {
        const onboardingUrl = new URL(ONBOARDING_PATH, req.url);
        onboardingUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(onboardingUrl);
      }

      if (hasUploadedImage && isOnboardingPath) {
        const nextDestination = req.nextUrl.searchParams.get('next') || '/';
        return NextResponse.redirect(new URL(nextDestination, req.url));
      }
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-).*)'],
};
