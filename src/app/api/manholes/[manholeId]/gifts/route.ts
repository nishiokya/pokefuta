import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { canOfferGift, isGiftActive } from '@/lib/visit-gift';
import { INSTAGRAM_HOSTS, X_HOSTS, safeSocialUrl } from '@/lib/social-url';

/**
 * @swagger
 * /api/manholes/{manholeId}/gifts:
 *   get:
 *     summary: このポケふたのギフトを配れる人
 *     tags: [manholes]
 *     description: |
 *       「このポケふたのギフトを配れます」の印が期限内で、トレーナーコードを公開している人を
 *       撮影日の新しい順に5人まで返す（get_manhole_gift_givers）。
 *       ログイン中なら、この蓋の自分の配布中の記録（なければ最新の記録）も返す。
 *     parameters:
 *       - in: path
 *         name: manholeId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 一覧（0件なら空配列）
 *       400:
 *         description: manholeId が数でない
 *   delete:
 *     summary: このポケふたでの自分のギフト配布を終了
 *     tags: [manholes]
 *     parameters:
 *       - in: path
 *         name: manholeId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 自分の期限内の配布設定を解除
 *       401:
 *         description: 認証が必要
 */

// 見ている人ごとに own が変わり、クッキー付きのクライアントはトークン更新の Set-Cookie を
// 書きうるので、共有キャッシュに載せない（CLAUDE.md「共有キャッシュとセッション」）。
const NO_STORE = { 'Cache-Control': 'private, no-store' };

type GiverRow = {
  visit_id: string;
  public_user_id: string | null;
  display_name: string | null;
  pokemon_go_friend_code: string | null;
  pokemon_go_friend_note: string | null;
  shot_at: string;
  gift_until: string;
  is_own: boolean;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { manholeId: string } }
) {
  const manholeId = Number(params.manholeId);
  if (!Number.isInteger(manholeId)) {
    return NextResponse.json({ success: false, error: 'Invalid manhole id' }, { status: 400, headers: NO_STORE });
  }

  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: giverData, error: giverError } = await supabase.rpc(
      'get_manhole_gift_givers' as never,
      { p_manhole_id: manholeId } as never
    );
    if (giverError) {
      console.error('Failed to load gift givers:', giverError);
      return NextResponse.json({ success: false, error: 'Failed to load gift givers' }, { status: 500, headers: NO_STORE });
    }

    const giverRows = ((giverData as GiverRow[] | null) || [])
      .filter((row) => row.pokemon_go_friend_code);
    // 最大5人の公開プロフィールからSNSリンクだけを取得する。
    const givers = await Promise.all(giverRows.map(async (row) => {
      const { data: profile, error: profileError } = row.public_user_id
        ? await supabase.rpc('get_public_profile', { p_user_id: row.public_user_id })
        : { data: null, error: null };
      if (profileError) console.warn('Failed to load gift giver social links:', profileError);

      return {
        visit_id: row.visit_id,
        public_user_id: row.public_user_id,
        display_name: row.display_name,
        friend_code: row.pokemon_go_friend_code as string,
        friend_note: row.pokemon_go_friend_note,
        shot_at: row.shot_at,
        gift_until: row.gift_until,
        is_own: Boolean(row.is_own),
        x_url: safeSocialUrl(profile?.[0]?.x_url, X_HOSTS),
        instagram_url: safeSocialUrl(profile?.[0]?.instagram_url, INSTAGRAM_HOSTS),
      };
    }));

    // 自分の記録。印を付ける・外すボタンと「コードを公開すると載ります」の案内に使う。
    let own: {
      visit_id: string;
      shot_at: string;
      gift_until: string | null;
      is_public: boolean;
      can_offer: boolean;
      friend_open: boolean;
    } | null = null;

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (userId) {
      const ownVisits = () => supabase
        .from('visit')
        .select('id, shot_at, gift_until, is_public')
        .eq('user_id', userId)
        .eq('manhole_id', manholeId)
        .order('shot_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      const [{ data: visits }, { data: activeVisits }, { data: profile }] = await Promise.all([
        ownVisits(),
        // 新しい写真に印がなくても、以前の公開記録で配布中なら停止できるようにする。
        ownVisits()
          .eq('is_public', true)
          .gt('gift_until', new Date().toISOString()),
        supabase.rpc('get_own_profile' as never),
      ]);
      const latest = activeVisits?.[0] ?? visits?.[0];
      if (latest) {
        const profileRow = (Array.isArray(profile) ? profile[0] : profile) as { pokemon_go_friend_open?: boolean } | null;
        own = {
          visit_id: latest.id,
          shot_at: latest.shot_at,
          gift_until: isGiftActive(latest.gift_until) ? latest.gift_until : null,
          is_public: latest.is_public !== false,
          can_offer: canOfferGift(latest.shot_at),
          friend_open: profileRow?.pokemon_go_friend_open === true,
        };
      }
    }

    return NextResponse.json({ success: true, givers, own }, { headers: NO_STORE });
  } catch (error: any) {
    console.error('Unexpected error loading gift givers:', error);
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500, headers: NO_STORE });
  }
}

// このポケふたでの自分の配布を終了する。古い訪問に付いた印もまとめて解除する。
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { manholeId: string } }
) {
  const manholeId = Number(params.manholeId);
  if (!Number.isInteger(manholeId) || manholeId <= 0) {
    return NextResponse.json({ success: false }, { status: 400, headers: NO_STORE });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false }, { status: 401, headers: NO_STORE });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('visit')
    .update({ gift_until: null, updated_at: now })
    .eq('manhole_id', manholeId)
    .eq('user_id', user.id)
    .gt('gift_until', now);
  if (error) {
    console.error('Failed to stop offering gifts:', error);
    return NextResponse.json({ success: false }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
