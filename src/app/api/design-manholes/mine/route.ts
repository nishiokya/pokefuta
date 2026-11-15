import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { storage, deriveDesignSmallKey } from '@/lib/storage';
import {
  needsSignedPhotoUrl,
  toOwnDesignManhole,
  type OwnDesignManhole,
  type OwnDesignManholeRow,
} from '@/lib/own-design-manholes';

export const dynamic = 'force-dynamic';
// supabase-js の PostgREST GET が Next の Data Cache に乗らないようにする
export const fetchCache = 'force-no-store';

// ログイン中の本人の応答。クッキーを読むクライアントを使うので、すべての応答を共有キャッシュさせない
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

async function signedUrlFor(storageKey: string): Promise<string | null> {
  const smallKey = deriveDesignSmallKey(storageKey);
  // サムネイル生成に失敗している投稿は original にフォールバック（[id]/photo と同じ）
  if (smallKey && (await storage.exists?.(smallKey))) {
    try {
      return (await storage.getSignedUrl(smallKey, 3600)).url;
    } catch {
      // original を試す
    }
  }
  try {
    return (await storage.getSignedUrl(storageKey, 3600)).url;
  } catch {
    return null;
  }
}

/**
 * @swagger
 * /api/design-manholes/mine:
 *   get:
 *     summary: 自分が投稿したデザインマンホールの一覧
 *     tags: [design-manholes]
 *     description: |
 *       ログイン中の本人の投稿を新しい順に最大500枚。公開中・確認待ち（needs_review）・
 *       公式のポケふたの訪問記録へ移したものを返す。確認待ちと移した分の写真は署名付きURL。
 *       応答は常に Cache-Control: private, no-store。
 *     responses:
 *       200: { description: 成功 }
 *       401: { description: 未ログイン }
 *       500: { description: 取得に失敗 }
 */
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401, headers: PRIVATE_HEADERS }
      );
    }

    const { data, error } = await supabase.rpc('get_own_design_manholes' as never);
    if (error) {
      console.error('Own design manholes rpc error:', error);
      return NextResponse.json(
        { success: false, error: '投稿の取得に失敗しました' },
        { status: 500, headers: PRIVATE_HEADERS }
      );
    }

    const rows = (Array.isArray(data) ? data : []) as OwnDesignManholeRow[];
    const items = await Promise.all(
      rows.map(async (row): Promise<OwnDesignManhole | null> => {
        if (!needsSignedPhotoUrl(row)) return toOwnDesignManhole(row);
        const url = await signedUrlFor(row.storage_key);
        if (!url) {
          console.error('Own design manhole photo sign failed:', row.id);
          return null;
        }
        return toOwnDesignManhole(row, url);
      })
    );

    return NextResponse.json(
      { success: true, design_manholes: items.filter((x): x is OwnDesignManhole => x !== null) },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    console.error('Own design manholes error:', error);
    return NextResponse.json(
      { success: false, error: '投稿の取得に失敗しました' },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
}
