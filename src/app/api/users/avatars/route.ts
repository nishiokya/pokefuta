import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { avatarsFor } from '@/lib/avatar-snapshot';
import { loadCachedAvatars } from '@/lib/manhole-snapshot';

// 投稿者のアイコンをまとめて引く。
// 一覧（トップの投稿・LEGEND・ぬいぐるみの特集）で投稿者ごとに1回ずつ取りに行かないための窓口。
//
// 図鑑の avatars.json（日次、サーバのメモリに1時間）から引き、取れないときだけ
// 公開ページと同じ get_public_avatar_photo_id を1人ずつ呼ぶ。
// アイコンを選び直してから他の人の画面に出るのは翌朝の日次ジョブのあと（本人の画面は
// setPublicAvatarPhotoId() がその場で差し替える）。
//
// 公開の情報だけなので CDN に置く。共有キャッシュに載せるので、クッキーを読まない
// anon クライアントで読む（CLAUDE.md「共有キャッシュとセッション」）。

/** 図鑑を待つ上限。超えたら RPC に切り替える（取り込みは裏で続き、次から使われる） */
const SNAPSHOT_TIMEOUT_MS = 1500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AVATAR_IDS = 30;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = Array.from(new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)));
  if (ids.length === 0 || ids.length > MAX_AVATAR_IDS || !ids.every((id) => UUID_RE.test(id))) {
    return NextResponse.json({ error: 'ids が不正です。' }, { status: 400 });
  }

  // まず図鑑の avatars.json（日次）。表に無い人は「未設定（null）」。
  // 1人ずつの RPC で Supabase へ 1日 約1.2万回出ていたのをやめる（avatar-snapshot.ts）
  const snapshot = await loadCachedAvatars({ timeoutMs: SNAPSHOT_TIMEOUT_MS });
  if (snapshot) {
    return NextResponse.json(
      { avatars: avatarsFor(ids, snapshot) },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
    );
  }

  // 図鑑が取れないときだけ、今までどおり1人ずつ RPC で引く
  const supabase = createAnonClient();
  // 取れなかった人（RPC の一時的な失敗）は「未設定（null）」と区別して avatars に入れない。
  // その応答は共有キャッシュにもブラウザにも置かず、次に開いたときに取り直させる
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, string | null] | null> => {
      try {
        const { data, error } = await supabase.rpc('get_public_avatar_photo_id' as never, { p_user_id: id } as never);
        if (error) {
          console.warn('Failed to load public avatar:', error.message);
          return null;
        }
        return [id, typeof data === 'string' ? data : null];
      } catch {
        return null;
      }
    })
  );
  const loaded = entries.filter((entry): entry is [string, string | null] => entry !== null);

  return NextResponse.json(
    { avatars: Object.fromEntries(loaded) },
    {
      headers: {
        'Cache-Control': loaded.length === ids.length
          ? 'public, s-maxage=300, stale-while-revalidate=3600'
          : 'no-store',
      },
    }
  );
}
