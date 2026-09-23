import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import type { ManholeTitle } from '@/types/database';

/**
 * @swagger
 * /api/manholes/{manholeId}/title-reports:
 *   post:
 *     summary: 蓋のタグ（称号）の間違いを指摘
 *     tags: [social]
 *     description: >
 *       タグは図鑑側で自動生成したもので、ここでは直さない。指摘を貯めて運営が図鑑側で直す。
 *       同じ人が同じタグを再指摘しても 200（件数は増えない）。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: manholeId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title_key]
 *             properties:
 *               title_key:
 *                 type: string
 *                 description: manhole.titles[].key
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: 受け付けた（既に指摘済みでも 200）
 *       400:
 *         description: title_key が無い、またはその蓋のタグではない
 *       401:
 *         description: 認証が必要
 *       404:
 *         description: 蓋が見つからない
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { manholeId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const manholeId = Number(params.manholeId);
    if (!Number.isFinite(manholeId)) {
      return NextResponse.json({ success: false, error: 'Invalid manhole id' }, { status: 400 });
    }

    let body: { title_key?: unknown; reason?: unknown } | null = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const titleKey = typeof body?.title_key === 'string' ? body.title_key.trim() : '';
    if (!titleKey) {
      return NextResponse.json({ success: false, error: 'title_key is required' }, { status: 400 });
    }

    // 理由はコードポイント単位で切る（comment_report と同じ理由: サロゲートペアの途中で
    // 切ると Postgres が 22P05 で拒否する）。DB の CHECK も char_length で揃う。
    const reason =
      typeof body?.reason === 'string' && body.reason.trim()
        ? Array.from(body.reason.trim()).slice(0, 500).join('')
        : null;

    // その蓋に実在するタグだけを受け付ける。任意の文字列で滞留件数を膨らませられないように。
    const { data: manhole, error: manholeError } = await supabase
      .from('manhole')
      .select('id, titles')
      .eq('id', manholeId)
      .single();

    if (manholeError || !manhole) {
      return NextResponse.json({ success: false, error: 'Manhole not found' }, { status: 404 });
    }

    const titles = (Array.isArray((manhole as { titles?: unknown }).titles)
      ? (manhole as { titles: ManholeTitle[] }).titles
      : []) as ManholeTitle[];
    const title = titles.find((t) => t?.key === titleKey);
    if (!title) {
      return NextResponse.json({ success: false, error: 'Unknown title for this manhole' }, { status: 400 });
    }

    // **`.select()` を付けないこと。** SELECT ポリシーが無いので RETURNING は 42501 で落ちる。
    const { error: insertError } = await supabase
      .from('manhole_title_report')
      .insert({
        manhole_id: manholeId,
        title_key: titleKey,
        title_label: title.label ?? null,
        reporter_user_id: session.user.id,
        reason,
      });

    if (insertError) {
      // 23505 = 同じ人が同じタグを再指摘（部分ユニーク索引）。利用者にはエラーを見せない。
      if (insertError.code === '23505') {
        return NextResponse.json({ success: true, already_reported: true });
      }
      console.error('Error creating title report:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to report title' }, { status: 500 });
    }

    return NextResponse.json({ success: true, already_reported: false });
  } catch (error) {
    console.error('Unexpected error reporting title:', error);
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500 });
  }
}
