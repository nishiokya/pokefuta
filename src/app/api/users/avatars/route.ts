import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';

// 投稿者のアイコン（公開ページと同じ get_public_avatar_photo_id）をまとめて引く。
// 一覧（トップの投稿・LEGEND・ぬいぐるみの特集）で投稿者ごとに1回ずつ取りに行かないための窓口。
//
// 公開の情報だけなので CDN に置く。共有キャッシュに載せるので、クッキーを読まない
// anon クライアントで読む（CLAUDE.md「共有キャッシュとセッション」）。
// アイコンを選び直してから他の人の画面に出るまでは、最大で s-maxage の分だけ遅れる。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AVATAR_IDS = 30;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = Array.from(new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)));
  if (ids.length === 0 || ids.length > MAX_AVATAR_IDS || !ids.every((id) => UUID_RE.test(id))) {
    return NextResponse.json({ error: 'ids が不正です。' }, { status: 400 });
  }

  const supabase = createAnonClient();
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, string | null]> => {
      try {
        const { data, error } = await supabase.rpc('get_public_avatar_photo_id' as never, { p_user_id: id } as never);
        if (error) return [id, null];
        return [id, typeof data === 'string' ? data : null];
      } catch {
        return [id, null];
      }
    })
  );

  return NextResponse.json(
    { avatars: Object.fromEntries(entries) },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
  );
}
