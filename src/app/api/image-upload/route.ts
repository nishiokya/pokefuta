import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase/client';
import { storage, generateStorageKey } from '@/lib/storage';

/**
 * @swagger
 * /api/image-upload:
 *   post:
 *     summary: 写真をアップロードして訪問記録を作成
 *     tags: [photos]
 *     description: 写真ファイルをアップロードし、マンホール訪問記録を作成します。画像はR2ストレージに保存され、訪問記録とフォトレコードがデータベースに作成されます。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - manhole_id
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: アップロードする画像ファイル（JPEG/PNG/WebP、最大2MB推奨）
 *               manhole_id:
 *                 type: integer
 *                 description: マンホールID（必須）
 *               shot_at:
 *                 type: string
 *                 format: date-time
 *                 description: 撮影日時（ISO8601形式、省略時は現在時刻）
 *               note:
 *                 type: string
 *                 description: 個人メモ（常に非公開、is_publicの設定に関わらず自分だけが閲覧可能）
 *               comment:
 *                 type: string
 *                 maxLength: 500
 *                 description: 訪問コメント（is_publicがtrueの場合に他のユーザーも閲覧可能、最大500文字）
 *               is_public:
 *                 type: string
 *                 enum: ['true', 'false']
 *                 default: 'true'
 *                 description: 公開設定（true=他のユーザーもcommentを閲覧可能、false=自分だけが閲覧可能、デフォルト：公開）
 *               latitude:
 *                 type: number
 *                 format: float
 *                 description: 撮影位置の緯度
 *               longitude:
 *                 type: number
 *                 format: float
 *                 description: 撮影位置の経度
 *               metadata:
 *                 type: string
 *                 description: 追加メタデータ（JSON文字列）
 *     responses:
 *       200:
 *         description: アップロード成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Image uploaded successfully
 *                 visit_id:
 *                   type: string
 *                   format: uuid
 *                   description: 作成された訪問記録のID
 *                 image:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     filename:
 *                       type: string
 *                     content_type:
 *                       type: string
 *                     file_size:
 *                       type: integer
 *                     storage_key:
 *                       type: string
 *                     uploaded_at:
 *                       type: string
 *                       format: date-time
 *                     url:
 *                       type: string
 *                       description: 署名付きURL（1時間有効）
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *                 storage_provider:
 *                   type: string
 *                   example: r2
 *       400:
 *         description: バリデーションエラー
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: manhole_id is required - photos must be linked to a manhole
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
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // ✅ 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const manholeId = formData.get('manhole_id');
    const shotAt = formData.get('shot_at');
    const note = formData.get('note');
    const comment = formData.get('comment');  // 訪問コメント
    const isPublic = formData.get('is_public');  // 公開設定
    const shotLocation = formData.get('shot_location');
    const latitude = formData.get('latitude');
    const longitude = formData.get('longitude');

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 });
    }

    // ✅ Validate manhole_id is required
    if (!manholeId) {
      return NextResponse.json({
        success: false,
        error: 'manhole_id is required - photos must be linked to a manhole'
      }, { status: 400 });
    }

    const manholeIdInt = parseInt(manholeId as string);
    if (isNaN(manholeIdInt)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid manhole_id - must be a number'
      }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({
        success: false,
        error: 'File must be an image'
      }, { status: 400 });
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    // Generate storage key for R2
    const storageKey = generateStorageKey('original');

    // Upload to R2 storage
    await storage.put(storageKey, arrayBuffer, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    console.log(`File uploaded successfully to storage: ${storageKey}`);

    // Get signed URL for the uploaded file
    const signedUrl = await storage.getSignedUrl(storageKey, 3600); // 1 hour

    // Create visit and image records
    let visitId: string | null = null;
    let imageId: string | null = null;

    try {
      // ✅ 強制的にログインユーザーのIDを使用
      const userId = session.user.id;
      console.log('Creating visit with user_id:', userId);

      // Parse shot_at timestamp properly - convert to Date object for PostgreSQL
      let shotAtDate: Date;
      if (shotAt) {
        shotAtDate = new Date(shotAt as string);
        // Validate date
        if (isNaN(shotAtDate.getTime())) {
          shotAtDate = new Date(); // Fallback to current time
        }
      } else {
        shotAtDate = new Date();
      }

      // Build shot_location as PostGIS POINT if coordinates are provided
      let shotLocationGeom = shotLocation as string | null;
      if (latitude && longitude) {
        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        if (!isNaN(lat) && !isNaN(lng)) {
          shotLocationGeom = `POINT(${lng} ${lat})`;
        }
      }

      // Create visit record with proper Date type
      console.log('Creating visit record. userId:', userId, 'shot_at:', shotAtDate.toISOString());

      const visitInsert: any = {
        user_id: userId,  // ✅ 必ず自分のID
        shot_at: shotAtDate, // Pass Date object, not string
      };

      // Add optional fields only if they exist in schema
      // manhole_id is now required (validated above)
      visitInsert.manhole_id = manholeIdInt;

      if (shotLocationGeom) {
        visitInsert.shot_location = shotLocationGeom;
      }
      if (note) {
        visitInsert.note = note as string;
      }
      if (comment) {
        visitInsert.comment = comment as string;  // 訪問コメント
      }
      // is_public: デフォルトはtrue、明示的にfalseが送られた場合のみfalseにする
      visitInsert.is_public = isPublic === 'false' ? false : true;

      const { data: visitData, error: visitError } = await supabase
        .from('visit')
        .insert(visitInsert)
        .select()
        .single();

      if (!visitError && visitData) {
        visitId = visitData.id;
        console.log('Successfully created visit record:', visitId);
      } else {
        console.error('Failed to create visit record:', visitError?.message);
        throw new Error(`Visit creation failed: ${visitError?.message}`);
      }

      // Create photo record with required and optional fields
      const photoInsert: any = {
        visit_id: visitId,
        manhole_id: manholeIdInt, // ✅ 必須: photoは必ずマンホールに紐づく
        storage_key: storageKey,
      };

      // Add optional fields if they exist in schema
      if (fileSize) photoInsert.file_size = fileSize;
      if (file.type) photoInsert.content_type = file.type;
      if (file.name) photoInsert.original_name = file.name;

      const { data: photoData, error: photoError } = await supabase
        .from('photo')
        .insert(photoInsert)
        .select()
        .single();

      if (!photoError && photoData) {
        imageId = photoData.id;
        console.log('Successfully stored photo metadata in database:', imageId);
      } else {
        console.error('Photo insert failed:', photoError?.message);
        throw new Error(`Photo creation failed: ${photoError?.message}`);
      }

    } catch (dbError: any) {
      console.error('Database operation failed:', dbError?.message);
      return NextResponse.json({
        success: false,
        error: 'Database operation failed',
        details: dbError?.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Image uploaded successfully',
      visit_id: visitId,
      image: {
        id: imageId,
        filename: file.name,
        content_type: file.type,
        file_size: fileSize,
        storage_key: storageKey,
        uploaded_at: new Date().toISOString(),
        url: signedUrl.url,
        expires_at: signedUrl.expiresAt,
      },
      storage_provider: process.env.STORAGE_PROVIDER || 'r2',
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during upload',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/image-upload:
 *   get:
 *     summary: 写真一覧を取得
 *     tags: [photos]
 *     parameters:
 *       - in: query
 *         name: key
 *         schema:
 *           type: string
 *         description: ストレージキー（指定した場合は署名付きURLへリダイレクト）
 *       - in: query
 *         name: manhole_id
 *         schema:
 *           type: integer
 *         description: マンホールIDでフィルタ
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: 取得件数
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: オフセット（ページネーション用）
 *     responses:
 *       200:
 *         description: 写真一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 images:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Photo'
 *                 count:
 *                   type: integer
 *                 total:
 *                   type: integer
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { searchParams } = new URL(request.url);
    const storageKey = searchParams.get('key');
    const manholeId = searchParams.get('manhole_id');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    if (storageKey) {
      // Redirect to signed URL for the specific image
      const signedUrl = await storage.getSignedUrl(storageKey, 3600);
      return NextResponse.redirect(signedUrl.url);
    } else {
      // Build query based on filters
      let query = supabase
        .from('photo')
        .select(`
          *,
          visit(
            id,
            user_id,
            shot_at,
            created_at,
            manhole_id,
            comment,
            is_public
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      // Filter by manhole_id if provided
      if (manholeId) {
        query = query.eq('manhole_id', parseInt(manholeId));
      }

      // Apply limit and offset from query parameters
      const limit = limitParam ? parseInt(limitParam) : 100;
      const offset = offsetParam ? parseInt(offsetParam) : 0;

      query = query.limit(limit);
      if (offset > 0) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data: images, error, count } = await query;

      if (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch images',
          details: error.message
        }, { status: 500 });
      }

      // Attach display_name for each photo's visit user (best-effort)
      const visitUserIds = Array.from(
        new Set(
          (images || [])
            .map((img: any) => img?.visit?.user_id)
            .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      let displayNameByAuthUid = new Map<string, string | null>();

      if (visitUserIds.length > 0) {
        // A方針: app_user.display_name を公開SELECTで解決するため、通常のroute clientを使う
        const { data: appUsers, error: appUserError } = await supabase
          .from('app_user')
          .select('auth_uid, display_name')
          .in('auth_uid', visitUserIds);

        if (appUserError) {
          console.warn('Failed to load app_user for photo list:', appUserError);
        } else {
          (appUsers || []).forEach((u: any) => {
            if (u?.auth_uid) {
              displayNameByAuthUid.set(u.auth_uid, u.display_name ?? null);
            }
          });
        }
      }

      const enrichedImages = (images || []).map((img: any) => {
        const visit = img?.visit;
        if (visit && typeof visit === 'object' && !Array.isArray(visit)) {
          const displayName = displayNameByAuthUid.get(visit.user_id) ?? null;
          return {
            ...img,
            visit: {
              ...visit,
              display_name: displayName
            }
          };
        }
        return img;
      });

      return NextResponse.json({
        success: true,
        message: 'Images retrieved successfully',
        images: enrichedImages,
        count: enrichedImages.length,
        total: count || 0,
      });
    }

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to get image',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}