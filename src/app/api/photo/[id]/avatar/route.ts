import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { createAnonClient } from '@/lib/supabase/anon';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { storage, deriveSmallKey } from '@/lib/storage';
import { avatarCropSquare } from '@/lib/photo-ai-tags';
import { PHOTO_BROWSER_MAX_AGE_SECONDS, PUBLIC_PHOTO_CDN_MAX_AGE_SECONDS } from '@/lib/photo-redirect-cache';

export const dynamic = 'force-dynamic';
// /api/photo/[id] と同じ理由（#275）。公開→非公開の切り替えを Data Cache で見落とさない
export const fetchCache = 'force-no-store';

// アイコン用の画像。写真の縮小版（size=small）から、蓋の枠（ai_tags.lid）に合わせた正方形を切り出して返す。
// 丸く見せると蓋が丸をいっぱいに埋める（地面が写らない）。lid が無い写真は一覧の正方形か真ん中の正方形。
//
// 見える範囲は /api/photo/[id] と同じ（公開写真は anon で引いて CDN に置く。非公開は本人だけ・private）。
// 縮小版が無い写真は元画像を切らずに 404（今までの ?size=small&strict=1 と同じ。呼び出し側は人のマークに戻す）。
// 出す大きさは 56px の丸の 2 倍。数 KB の WebP なので、転送先へリダイレクトせずにそのまま返す。

const OUTPUT_PX = 112;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () =>
  NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const photoId = params.id;
  if (!UUID_RE.test(photoId)) return notFound();
  try {
    const selectPhoto = (client: SupabaseClient<Database>) => client
      .from('photo')
      .select(`
        id,
        storage_key,
        ai_tags,
        visit:visit_id!inner (
          user_id,
          is_public
        )
      `)
      .eq('id', photoId)
      .maybeSingle();

    let { data: photo, error } = await selectPhoto(createAnonClient());
    let viewerUserId: string | null = null;
    let readCookies = false;
    if (!error && !photo) {
      readCookies = true;
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { session } } = await supabase.auth.getSession();
      viewerUserId = session?.user?.id ?? null;
      if (viewerUserId) ({ data: photo, error } = await selectPhoto(supabase));
    }
    if (error || !photo) return notFound();

    // 生成済みの型（src/types/database.ts）に ai_tags 列がまだ無いので、使う列だけの形に直す
    const row = photo as unknown as {
      storage_key: string;
      ai_tags: unknown;
      visit: { user_id: string; is_public: boolean | null } | { user_id: string; is_public: boolean | null }[] | null;
    };
    const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
    const isPublic = visit?.is_public === true;
    if (!isPublic && !(viewerUserId && visit?.user_id === viewerUserId)) return notFound();

    const smallKey = deriveSmallKey(row.storage_key);
    if (!smallKey || !(await storage.exists?.(smallKey))) return notFound();

    const signed = await storage.getSignedUrl(smallKey, 60);
    const res = await fetch(signed.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`small variant fetch failed: ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());

    // 向きを直してから寸法を測る（ai_tags の枠は見たままの向きの写真に対する割合）
    const { data: oriented, info } = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
    const square = avatarCropSquare(row.ai_tags, info.width, info.height);
    const output = await sharp(oriented)
      .extract(square)
      .resize(OUTPUT_PX, OUTPUT_PX)
      .webp({ quality: 80 })
      .toBuffer();

    // 公開写真でクッキーを読んでいない応答だけ CDN に置く（/api/photo/[id] と同じ寿命）
    const cacheControl = isPublic && !readCookies
      ? `public, max-age=${PHOTO_BROWSER_MAX_AGE_SECONDS}, s-maxage=${PUBLIC_PHOTO_CDN_MAX_AGE_SECONDS}`
      : `private, max-age=${PHOTO_BROWSER_MAX_AGE_SECONDS}`;
    return new NextResponse(new Uint8Array(output), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': cacheControl,
        // 図鑑（data.pokefuta.com）のヘッダー・詳細ページからも <img> で読む
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch (error: any) {
    console.error('Error building avatar image:', error?.message || error);
    return NextResponse.json({ success: false, error: 'Failed to build avatar' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
