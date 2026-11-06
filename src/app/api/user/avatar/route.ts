import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';

// プロフィールのアイコン（自分の公開訪問の写真から1枚）を読む・選ぶ。
//
// 選べる写真の判定（本人の写真か・訪問が公開か）は DB の set_own_avatar_photo() が持つ。
// ここは利用者向けの文言を出すだけで、境界ではない（anon キーで RPC を直接呼べるため）。
// マイグレーション: supabase/migrations/20261106150000_app_user_avatar_photo.sql

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ログイン中の人の応答なので共有キャッシュに載せない（CLAUDE.md「共有キャッシュとセッション」）
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET() {
  const supabase = createRouteHandlerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'ログインが必要です。' }, 401);
  }

  const { data, error } = await supabase.rpc('get_own_avatar_photo_id' as never);
  if (error) {
    // マイグレーション未適用の窓でもプロフィール画面は壊さない（アイコン無しで出す）
    console.warn('Failed to load own avatar:', error);
    return json({ photoId: null });
  }
  return json({ photoId: (data as unknown as string | null) ?? null });
}

export async function PUT(request: Request) {
  const supabase = createRouteHandlerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'ログインが必要です。' }, 401);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: '入力内容を読み取れませんでした。' }, 400);
  }
  const photoId = (input as { photoId?: unknown } | null)?.photoId;
  if (photoId !== null && (typeof photoId !== 'string' || !UUID_RE.test(photoId))) {
    return json({ error: '写真を選んでください。' }, 400);
  }

  const { data, error } = await supabase.rpc(
    'set_own_avatar_photo' as never,
    { p_photo_id: photoId } as never
  );

  if (error) {
    if (error.message?.includes('Photo is not available for avatar')) {
      return json({ error: 'この写真はアイコンにできません。公開している訪問の写真から選んでください。' }, 400);
    }
    console.error('Failed to set avatar photo:', error);
    return json({ error: 'アイコンを保存できませんでした。' }, 500);
  }

  return json({ success: true, photoId: (data as unknown as string | null) ?? null });
}
