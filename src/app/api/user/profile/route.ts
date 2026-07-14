import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';

const DISPLAY_NAME_MAX = 40;
const BIO_MAX = 160;
const URL_MAX = 300;

type ProfileInput = {
  displayName?: unknown;
  bio?: unknown;
  xUrl?: unknown;
  instagramUrl?: unknown;
};

function optionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSocialUrl(value: string, hosts: string[]) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && hosts.includes(url.hostname.toLowerCase())
      && url.pathname.split('/').filter(Boolean).length === 1;
  } catch {
    return false;
  }
}

export async function PATCH(request: Request) {
  const supabase = createRouteHandlerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  let input: ProfileInput;
  try {
    input = await request.json() as ProfileInput;
  } catch {
    return NextResponse.json({ error: '入力内容を読み取れませんでした。' }, { status: 400 });
  }

  const displayName = optionalText(input.displayName);
  const bio = optionalText(input.bio);
  const xUrl = optionalText(input.xUrl);
  const instagramUrl = optionalText(input.instagramUrl);

  if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
    return NextResponse.json({ error: `表示名は1〜${DISPLAY_NAME_MAX}文字で入力してください。` }, { status: 400 });
  }
  if (bio.length > BIO_MAX) {
    return NextResponse.json({ error: `一言は${BIO_MAX}文字以内で入力してください。` }, { status: 400 });
  }
  if (xUrl.length > URL_MAX || !isSocialUrl(xUrl, ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'])) {
    return NextResponse.json({ error: 'XのプロフィールURLを https://x.com/ユーザー名 の形で入力してください。' }, { status: 400 });
  }
  if (instagramUrl.length > URL_MAX || !isSocialUrl(instagramUrl, ['instagram.com', 'www.instagram.com'])) {
    return NextResponse.json({ error: 'InstagramのプロフィールURLを https://instagram.com/ユーザー名 の形で入力してください。' }, { status: 400 });
  }

  const { error } = await supabase.rpc('update_own_public_profile', {
    p_display_name: displayName,
    p_bio: bio || null,
    p_x_url: xUrl || null,
    p_instagram_url: instagramUrl || null,
  });

  if (error) {
    console.error('Failed to update public profile:', error);
    return NextResponse.json({ error: 'プロフィールを保存できませんでした。' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
