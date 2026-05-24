import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'));
  const conversion = requestUrl.searchParams.get('conversion');
  const redirectUrl = new URL('/login', requestUrl.origin);

  if (!code) {
    redirectUrl.searchParams.set('auth_error', 'missing_auth_code');
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirectUrl.searchParams.set('auth_error', 'email_confirm_failed');
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.searchParams.set('from', 'email_confirmed');
  redirectUrl.searchParams.set('redirect', next);

  if (conversion === 'signup_email_confirmed') {
    redirectUrl.searchParams.set('conversion', conversion);
  }

  return NextResponse.redirect(redirectUrl);
}
