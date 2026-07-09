import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { storage, deriveDesignSmallKey } from '@/lib/storage';

export const dynamic = 'force-dynamic';
// supabase-js の PostgREST GET が Next の Data Cache に乗ると
// hidden 化した行の写真が配信され続けるため、fetch キャッシュを無効化する
export const fetchCache = 'force-no-store';

/**
 * @swagger
 * /api/design-manholes/{id}/photo:
 *   get:
 *     summary: デザインマンホールの写真を取得
 *     tags: [design-manholes]
 *     description: 公開中(published)の投稿のみ。写真のsigned URLにリダイレクトします。
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: size
 *         schema: { type: string, enum: [small] }
 *     responses:
 *       307: { description: Signed URLにリダイレクト }
 *       404: { description: 見つかりません }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'サーバー設定エラーが発生しました' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const size = searchParams.get('size');

    // hidden にした投稿は写真も 404 にする（status フィルタが本体）
    const { data: row, error } = await supabaseAdmin
      .from('design_manhole')
      .select('id, storage_key')
      .eq('id', params.id)
      .eq('status', 'published')
      .single();

    if (error || !row) {
      return NextResponse.json(
        { success: false, error: 'Not found' },
        { status: 404 }
      );
    }

    let storageKey = row.storage_key as string;
    if (size === 'small') {
      const smallKey = deriveDesignSmallKey(storageKey);
      // サムネイル生成に失敗している投稿は original にフォールバック
      if (smallKey && (await storage.exists?.(smallKey))) {
        storageKey = smallKey;
      }
    }

    const signedUrl = await storage.getSignedUrl(storageKey, 3600);

    // max-age は signed URL TTL(3600s) より十分短くする（/api/photo/[id] と同じ理屈）
    return NextResponse.redirect(signedUrl.url, {
      headers: {
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=600',
      },
    });
  } catch (error: any) {
    console.error('Design manhole photo error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch photo' },
      { status: 500 }
    );
  }
}
