import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { storage } from '@/lib/storage';

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

  const imageId = parseInt(params.imageId);
  if (!Number.isInteger(imageId) || imageId <= 0) {
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

  const { error: deleteError } = await supabase
    .from('photo_context_image')
    .delete()
    .eq('id', imageId);

  if (deleteError) {
    return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
  }

  if (storage.delete) {
    try {
      await storage.delete(image.storage_key);
    } catch (e) {
      console.error('R2 delete failed after DB delete:', e);
    }
  }

  return NextResponse.json({ success: true });
}
