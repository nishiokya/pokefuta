import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database, ShotContextLabel } from '@/types/database';
import { storage } from '@/lib/storage';
import { SHOT_CONTEXT_LABELS } from '@/lib/shot-context-labels';

async function getAuthedClient(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { supabase, user };
}

/**
 * @swagger
 * /api/user/context-images/{imageId}:
 *   delete:
 *     summary: 自分のコンテキスト画像を削除
 *     tags: [user]
 *     description: 指定したコンテキスト画像のDBレコードとR2上の画像ファイルを削除します。他ユーザーの画像は削除できません。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: コンテキスト画像ID
 *     responses:
 *       200:
 *         description: 削除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: imageIdが不正
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 認証が必要
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: 他ユーザーの画像は削除不可
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 画像が見つからない
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: { imageId: string } }
) {
  const auth = await getAuthedClient(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  const { supabase, user } = auth;

  const imageId = params.imageId;
  if (!imageId) {
    return NextResponse.json({ success: false, error: 'Invalid image id' }, { status: 400 });
  }

  const { data: image, error: fetchError } = await supabase
    .from('photo_context_image')
    .select('id, storage_key, created_by')
    .eq('id', imageId)
    .single();

  if (fetchError || !image) {
    return NextResponse.json({ success: false, error: 'Image not found' }, { status: 404 });
  }

  if (image.created_by !== user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  if (storage.delete) {
    try {
      await storage.delete(image.storage_key);
    } catch (e) {
      console.error('R2 delete failed, aborting DB delete:', e);
      return NextResponse.json({ success: false, error: 'Failed to delete image from storage' }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase
    .from('photo_context_image')
    .delete()
    .eq('id', imageId);

  if (deleteError) {
    return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * @swagger
 * /api/user/context-images/{imageId}:
 *   patch:
 *     summary: コンテキスト画像のラベルを更新
 *     tags: [user]
 *     description: 自分がアップロードしたコンテキスト画像の shot_context_label を更新します。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: コンテキスト画像ID（UUID）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shot_context_label
 *             properties:
 *               shot_context_label:
 *                 type: string
 *                 enum: [centered_clean, selfie_with_manhole, wide_context, signage_info, partial_occluded, not_relevant, low_quality]
 *                 description: 新しいラベル
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 context_image:
 *                   type: object
 *       400:
 *         description: ラベルが不正
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 認証が必要
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: 他ユーザーの画像は更新不可
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 画像が見つからない
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
export async function PATCH(
  request: NextRequest,
  { params }: { params: { imageId: string } }
) {
  const auth = await getAuthedClient(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  const { supabase, user } = auth;

  const imageId = params.imageId;
  if (!imageId) {
    return NextResponse.json({ success: false, error: 'Invalid image id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const label = body?.shot_context_label;
  if (!label || !SHOT_CONTEXT_LABELS.has(label)) {
    return NextResponse.json({
      success: false,
      error: `shot_context_label must be one of: ${[...SHOT_CONTEXT_LABELS].join(', ')}`,
    }, { status: 400 });
  }

  const { data: image, error: fetchError } = await supabase
    .from('photo_context_image')
    .select('id, created_by')
    .eq('id', imageId)
    .single();

  if (fetchError || !image) {
    return NextResponse.json({ success: false, error: 'Image not found' }, { status: 404 });
  }

  if (image.created_by !== user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { data: updated, error: updateError } = await supabase
    .from('photo_context_image')
    .update({ shot_context_label: label as ShotContextLabel })
    .eq('id', imageId)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ success: false, error: updateError?.message || 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, context_image: updated });
}
