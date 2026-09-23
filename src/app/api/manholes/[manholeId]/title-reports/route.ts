import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import type { ManholeTitle } from '@/types/database';

/**
 * @swagger
 * /api/manholes/{manholeId}/title-reports:
 *   post:
 *     summary: 蓋のタグ（称号）の間違いを指摘、または足りないタグを提案
 *     tags: [social]
 *     description: >
 *       タグは図鑑側で自動生成したもので、ここでは直さない。指摘を貯めて運営が図鑑側で直す。
 *       同じ人が同じタグを再指摘・同じ名前を再提案しても 200（件数は増えない）。
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
 *             properties:
 *               kind:
 *                 type: string
 *                 enum: [wrong, suggest]
 *                 default: wrong
 *               title_key:
 *                 type: string
 *                 description: kind=wrong のとき必須。manhole.titles[].key
 *               suggested_label:
 *                 type: string
 *                 maxLength: 50
 *                 description: kind=suggest のとき必須。提案するタグの名前
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: 受け付けた（既に指摘済みでも 200）
 *       400:
 *         description: kind に応じた項目が無い、title_key がその蓋のタグではない、提案名が長すぎる
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

    let body: { kind?: unknown; title_key?: unknown; suggested_label?: unknown; reason?: unknown } | null = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const kind = body?.kind === undefined ? 'wrong' : body.kind;
    if (kind !== 'wrong' && kind !== 'suggest') {
      return NextResponse.json({ success: false, error: 'kind must be wrong or suggest' }, { status: 400 });
    }

    const titleKey = typeof body?.title_key === 'string' ? body.title_key.trim() : '';
    if (kind === 'wrong' && !titleKey) {
      return NextResponse.json({ success: false, error: 'title_key is required' }, { status: 400 });
    }

    const suggestedLabel =
      typeof body?.suggested_label === 'string' ? body.suggested_label.trim() : '';
    if (kind === 'suggest') {
      if (!suggestedLabel) {
        return NextResponse.json({ success: false, error: 'suggested_label is required' }, { status: 400 });
      }
      // DB の CHECK（char_length <= 50）と同じ単位で数える
      if (Array.from(suggestedLabel).length > 50) {
        return NextResponse.json({ success: false, error: 'suggested_label is too long' }, { status: 400 });
      }
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
    const title = kind === 'wrong' ? titles.find((t) => t?.key === titleKey) : undefined;
    if (kind === 'wrong' && !title) {
      return NextResponse.json({ success: false, error: 'Unknown title for this manhole' }, { status: 400 });
    }

    // **`.select()` を付けないこと。** SELECT ポリシーが無いので RETURNING は 42501 で落ちる。
    const { error: insertError } = await supabase
      .from('manhole_title_report')
      .insert({
        manhole_id: manholeId,
        kind,
        title_key: kind === 'wrong' ? titleKey : null,
        title_label: title?.label ?? null,
        suggested_label: kind === 'suggest' ? suggestedLabel : null,
        reporter_user_id: session.user.id,
        reason,
      });

    if (insertError) {
      // 23505 = 同じ人が同じタグを再指摘／同じ名前を再提案（部分ユニーク索引）。
      // 利用者にはエラーを見せない。
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
