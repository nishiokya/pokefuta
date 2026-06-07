import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { storage } from '@/lib/storage';

/**
 * @swagger
 * /api/user/context-images:
 *   get:
 *     summary: 自分がアップロードしたコンテキスト画像一覧取得
 *     tags: [user]
 *     description: 認証ユーザーが全マンホールにわたってアップロードしたコンテキスト画像を取得します。各画像にはsigned URL（1時間有効）が付与されます。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: 取得件数（最大100）
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: オフセット
 *     responses:
 *       200:
 *         description: 取得成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 context_images:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       manhole_id:
 *                         type: integer
 *                       storage_key:
 *                         type: string
 *                       content_type:
 *                         type: string
 *                       file_size:
 *                         type: integer
 *                         nullable: true
 *                       width:
 *                         type: integer
 *                         nullable: true
 *                       height:
 *                         type: integer
 *                         nullable: true
 *                       shot_context_label:
 *                         type: string
 *                         nullable: true
 *                       shot_context_confidence:
 *                         type: number
 *                         nullable: true
 *                       shot_context_confidences:
 *                         type: object
 *                         nullable: true
 *                       manhole_classifier_label:
 *                         type: string
 *                         enum: [manhole, not_manhole]
 *                         nullable: true
 *                       manhole_classifier_confidence:
 *                         type: number
 *                         nullable: true
 *                       manhole_detection_result:
 *                         type: object
 *                         nullable: true
 *                       overlay_quality_grade:
 *                         type: string
 *                         enum: [p, e, g, f, b]
 *                         nullable: true
 *                       annotation_manhole_label:
 *                         type: string
 *                         enum: [manhole, not_manhole]
 *                         nullable: true
 *                       annotation_shot_context_label:
 *                         type: string
 *                         enum: [centered_clean, selfie_with_manhole, wide_context, signage_info, partial_occluded, not_relevant, low_quality]
 *                         nullable: true
 *                       source_platform:
 *                         type: string
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       url:
 *                         type: string
 *                         nullable: true
 *                         description: signed URL（1時間有効）
 *                       expires_at:
 *                         type: string
 *                         nullable: true
 *                 total:
 *                   type: integer
 *       401:
 *         description: 認証が必要
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: サーバーエラー
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50') || 50), 100);
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0') || 0);

  const { data, error, count } = await supabase
    .from('photo_context_image')
    .select('*', { count: 'exact' })
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (data ?? []).map(async (img) => {
      try {
        const signed = await storage.getSignedUrl(img.storage_key, 3600);
        return { ...img, url: signed.url, expires_at: signed.expiresAt };
      } catch {
        return { ...img, url: null, expires_at: null };
      }
    })
  );

  return NextResponse.json({ success: true, context_images: enriched, total: count ?? 0 });
}
