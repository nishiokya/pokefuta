import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import type { ManholeTitle } from '@/types/database';

/** 提案の行の title_key の接頭辞。運営は `title_key LIKE '@suggest:%'` で提案だけを拾える */
const SUGGEST_KEY_PREFIX = '@suggest:';
/** 提案名の上限。title_label の CHECK（100文字）に合わせる */
const SUGGESTED_LABEL_MAX = 100;

/**
 * @swagger
 * /api/manholes/{manholeId}/title-reports:
 *   post:
 *     summary: 蓋のタグ（称号）の間違いを指摘、または足りないタグを提案
 *     tags: [social]
 *     description: >
 *       タグは図鑑側で自動生成したもので、ここでは直さない。指摘を貯めて運営が図鑑側で直す。
 *       同じ人が同じタグを再指摘・同じ名前を再提案しても 200（件数は増えない）。
 *       提案は何件でも出せる（名前が違えば別の行になる）。
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
 *                 maxLength: 100
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
      // title_label の CHECK（char_length <= 100）と同じ単位で数える
      if (Array.from(suggestedLabel).length > SUGGESTED_LABEL_MAX) {
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

    // 提案はテーブルを変えずに既存の列へ入れる（マイグレーションを増やさない）:
    //   title_key   = '@suggest:' + 提案名 … 一意索引 (manhole_id, title_key, 人) の単位が
    //                 「提案名ごと」になるので、違う名前なら何件でも出せ、同じ名前の連打は1件になる
    //   title_label = 提案名
    // 既存タグの key は英数字なので '@' で始まるものと衝突しない。
    const reportKey =
      kind === 'suggest'
        ? `${SUGGEST_KEY_PREFIX}${Array.from(suggestedLabel).slice(0, 100 - SUGGEST_KEY_PREFIX.length).join('')}`
        : titleKey;

    // **`.select()` を付けないこと。** SELECT ポリシーが無いので RETURNING は 42501 で落ちる。
    const { error: insertError } = await supabase
      .from('manhole_title_report')
      .insert({
        manhole_id: manholeId,
        title_key: reportKey,
        title_label: kind === 'suggest' ? suggestedLabel : title?.label ?? null,
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
