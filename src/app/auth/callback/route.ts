import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';

function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // next/conversion are only present for email confirmation flow
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'));
  const conversion = requestUrl.searchParams.get('conversion');
  // Provider-level errors (user denied, invalid client) arrive as ?error= before our code runs
  const providerError = requestUrl.searchParams.get('error');

  // requestUrl.origin はリバースプロキシ環境で localhost を返すことがある。
  // NEXT_PUBLIC_SITE_URL > SITE_URL の順で優先し requestUrl.origin は使わない。
  const appOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL;
  const loginUrl = new URL('/login', appOrigin);

  if (providerError) {
    loginUrl.searchParams.set(
      'auth_error',
      providerError === 'access_denied' ? 'oauth_access_denied' : 'oauth_server_error',
    );
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    loginUrl.searchParams.set('auth_error', 'missing_auth_code');
    return NextResponse.redirect(loginUrl);
  }

  // Email confirmation flow: exchange server-side so the session is available
  // immediately when the login page loads (email link → same browser → cookies set).
  if (conversion === 'signup_email_confirmed') {
    const supabase = createRouteHandlerClient({ cookies });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      loginUrl.searchParams.set('auth_error', 'email_confirm_failed');
      return NextResponse.redirect(loginUrl);
    }
    loginUrl.searchParams.set('from', 'email_confirmed');
    loginUrl.searchParams.set('redirect', next);
    loginUrl.searchParams.set('conversion', conversion);
    return NextResponse.redirect(loginUrl);
  }

  // Google OAuth — pass the code to the client for client-side exchange.
  // NextResponse.redirect() does not reliably carry Set-Cookie headers from
  // createRouteHandlerClient's cookie adapter in Next.js 14 App Router,
  // so the session never reaches the browser when exchanged here on the server.
  // The PKCE verifier is already in the browser's cookies (set by signInWithOAuth),
  // so the client can exchange the code directly.
  loginUrl.searchParams.set('from', 'google_oauth');
  loginUrl.searchParams.set('code', code);
  return NextResponse.redirect(loginUrl);
}
