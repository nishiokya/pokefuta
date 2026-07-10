import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sharp from 'sharp';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { ensureAppUser } from '@/lib/auth/ensureAppUser';
import {
  storage,
  generateDesignManholeStorageKey,
  deriveDesignSmallKey,
} from '@/lib/storage';
import { isValidCoordinates } from '@/lib/location';

export const dynamic = 'force-dynamic';
// supabase-js の PostgREST GET が Next の Data Cache に乗るのを防ぐ
// （一覧から hidden 行が消えない事故の予防。CDN 側キャッシュは Cache-Control で制御）
export const fetchCache = 'force-no-store';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
// HEIC はクライアント側で browser-image-compression が JPEG に変換して送る前提。
// sharp(0.32) が HEIC をデコードできないためサーバーでは受けない。
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// デザインマンホールは日本のご当地文化なので日本近辺に限定（離島含むゆるめの矩形）
const JAPAN_BOUNDS = { latMin: 20, latMax: 46, lngMin: 122, lngMax: 154 };

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_SUBMITTER_NAME_LENGTH = 50;

function optionalText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * @swagger
 * /api/design-manholes:
 *   post:
 *     summary: デザインマンホールを投稿
 *     tags: [design-manholes]
 *     description: ポケふた以外のデザインマンホールを写真+位置情報付きで投稿します。要ログイン。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, lat, lng]
 *             properties:
 *               file: { type: string, format: binary }
 *               lat: { type: number }
 *               lng: { type: number }
 *               title: { type: string, maxLength: 100 }
 *               description: { type: string, maxLength: 1000 }
 *               submitterName: { type: string, maxLength: 50 }
 *               exif: { type: string, description: JSON string }
 *     responses:
 *       201: { description: 投稿成功 }
 *       400: { description: バリデーションエラー }
 *       401: { description: 認証が必要 }
 */
export async function POST(request: NextRequest) {
  let uploadedStorageKey: string | null = null;

  try {
    // 1. 認証（image-upload と同じ cookie セッション方式）
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }
    const userId = session.user.id;
    const displayName = session.user.user_metadata?.display_name as string | undefined;
    await ensureAppUser(supabase, userId, displayName);

    const formData = await request.formData();

    // 2. ファイル検証
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: '写真を選択してください' },
        { status: 400 }
      );
    }
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: 'JPEG/PNG/WebP形式の画像のみ投稿できます' },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `画像サイズが大きすぎます（最大${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）` },
        { status: 400 }
      );
    }

    // 3. 座標検証
    const lat = parseFloat(String(formData.get('lat') ?? ''));
    const lng = parseFloat(String(formData.get('lng') ?? ''));
    if (!isValidCoordinates(lat, lng)) {
      return NextResponse.json(
        { success: false, error: '位置情報を指定してください' },
        { status: 400 }
      );
    }
    if (
      lat < JAPAN_BOUNDS.latMin || lat > JAPAN_BOUNDS.latMax ||
      lng < JAPAN_BOUNDS.lngMin || lng > JAPAN_BOUNDS.lngMax
    ) {
      return NextResponse.json(
        { success: false, error: '日本国内の位置を指定してください' },
        { status: 400 }
      );
    }

    // 4. テキスト項目（すべて任意・長さ上限で切り詰め）
    const title = optionalText(formData.get('title'), MAX_TITLE_LENGTH);
    const description = optionalText(formData.get('description'), MAX_DESCRIPTION_LENGTH);
    const submitterName =
      optionalText(formData.get('submitterName'), MAX_SUBMITTER_NAME_LENGTH) ??
      (displayName ? displayName.slice(0, MAX_SUBMITTER_NAME_LENGTH) : null);

    let exif: Record<string, any> | null = null;
    const exifRaw = formData.get('exif');
    if (typeof exifRaw === 'string' && exifRaw) {
      try {
        const parsed = JSON.parse(exifRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          exif = parsed;
        }
      } catch {
        // EXIF は補助情報なので不正な JSON は黙って捨てる
      }
    }

    // 5. R2 アップロード + サムネイル生成
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const storageKey = generateDesignManholeStorageKey(file.type);
    uploadedStorageKey = storageKey;

    await storage.put(storageKey, buffer, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    let width: number | null = null;
    let height: number | null = null;
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      // 寸法取得失敗は非致命
    }

    const smallKey = deriveDesignSmallKey(storageKey);
    if (smallKey) {
      try {
        const thumbnail = await sharp(buffer)
          .rotate()
          .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer();
        await storage.put(smallKey, thumbnail, {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        });
      } catch (thumbError) {
        // サムネイル失敗は非致命（配信側が original にフォールバック）
        console.error('Design manhole thumbnail generation failed:', thumbError);
      }
    }

    // 6. DB 挿入（ユーザーセッションで実行。RLS が created_by = auth.uid() を担保。
    //    失敗時はアップロード済みオブジェクトを掃除）
    const { data: inserted, error: insertError } = await supabase
      .from('design_manhole')
      .insert({
        title,
        description,
        submitter_name: submitterName,
        latitude: lat,
        longitude: lng,
        storage_provider: process.env.STORAGE_PROVIDER || 'r2',
        storage_key: storageKey,
        content_type: file.type,
        file_size: file.size,
        width,
        height,
        exif,
        created_by: userId,
      })
      .select('id, title, latitude, longitude, created_at')
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message || 'Failed to insert design manhole');
    }

    return NextResponse.json(
      { success: true, design_manhole: inserted },
      { status: 201 }
    );
  } catch (error: any) {
    if (uploadedStorageKey && storage.delete) {
      try {
        await storage.delete(uploadedStorageKey);
        const smallKey = deriveDesignSmallKey(uploadedStorageKey);
        if (smallKey) await storage.delete(smallKey);
      } catch (cleanupError) {
        console.error('Failed to cleanup design manhole upload after error:', cleanupError);
      }
    }

    console.error('Design manhole submission error:', error);
    return NextResponse.json(
      { success: false, error: '投稿に失敗しました。時間をおいて再度お試しください' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/design-manholes:
 *   get:
 *     summary: 公開中のデザインマンホール一覧
 *     tags: [design-manholes]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, maximum: 200, default: 100 }
 *     responses:
 *       200: { description: 一覧 }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 200)
      : 100;

    // 公開カラムのみ返す（exif / storage_key / created_by は絶対に含めない）
    const { data, error } = await supabase
      .from('design_manhole')
      .select('id, title, description, submitter_name, latitude, longitude, width, height, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    const designManholes = (data ?? []).map((row: any) => ({
      ...row,
      photo_url: `/api/design-manholes/${row.id}/photo?size=small`,
    }));

    return NextResponse.json(
      { success: true, design_manholes: designManholes },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          // data.pokefuta.com の投稿LPがギャラリー表示に読む（公開カラムのみの一覧なので許可できる）
          'Access-Control-Allow-Origin': 'https://data.pokefuta.com',
        },
      }
    );
  } catch (error: any) {
    console.error('Design manhole list error:', error);
    return NextResponse.json(
      { success: false, error: '一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
