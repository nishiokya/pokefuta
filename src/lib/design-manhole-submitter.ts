import 'server-only';
import { getPublicLiveClient } from '@/lib/user-prefecture-progress';
import { publishedPhotoUrl, type OwnDesignManhole } from '@/lib/own-design-manholes';

// どちらも作者の取り下げ（hidden 化・公開訪問を非公開に戻す）がすぐ効くよう、キャッシュに載せない
// クライアントで取れなかった・RPC が失敗したときは null / 0 にして、ページ全体は落とさない
// （リンクとステッカーが出ないだけで、本文は表示できる）

/** 公開IDの人が公開したデザインマンホールの枚数（公開スタンプ帳のステッカー用） */
export async function loadPublicDesignManholeCount(publicUserId: string): Promise<number> {
  const client = getPublicLiveClient();
  if (!client) return 0;
  try {
    const { data, error } = await client.rpc(
      'get_public_design_manhole_count' as never,
      { p_user_id: publicUserId } as never
    );
    if (error) {
      console.warn('Failed to load design manhole count:', error);
      return 0;
    }
    return typeof data === 'number' && data > 0 ? data : 0;
  } catch (error) {
    console.warn('Failed to load design manhole count:', error);
    return 0;
  }
}

/**
 * 公開IDの人が公開したデザインマンホール（公開スタンプ帳の「投稿したデザインマンホール」用）。新しい順に最大60件。
 * 見た目を本人の一覧（/visits/design-manholes）と揃えるため、同じカードが受け取る OwnDesignManhole の形で返す。
 * 本人の一覧の RPC（get_own_design_manholes）は auth.uid() で絞るので、他の人のページでは使えない。
 * RPC が無い（本番へのマイグレーション適用前）・失敗したときは空にして、節ごと出さない
 */
export async function loadPublicDesignManholes(publicUserId: string): Promise<OwnDesignManhole[]> {
  const client = getPublicLiveClient();
  if (!client) return [];
  try {
    const { data, error } = await client.rpc(
      'get_public_design_manholes' as never,
      { p_user_id: publicUserId } as never
    );
    if (error) {
      console.warn('Failed to load design manholes:', error);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>)
      .filter((row) => typeof row.id === 'string' && typeof row.created_at === 'string')
      .map((row) => {
        const id = row.id as string;
        return {
          id,
          title: typeof row.title === 'string' && row.title ? row.title : null,
          description: typeof row.description === 'string' && row.description ? row.description : null,
          status: 'published' as const,
          created_at: row.created_at as string,
          photo_url: publishedPhotoUrl(id),
          href: `/design-manholes/${id}`,
        };
      });
  } catch (error) {
    console.warn('Failed to load design manholes:', error);
    return [];
  }
}

/** デザインマンホールの投稿者の公開ID。公開スタンプ帳へリンクできない人は null */
export async function loadDesignManholeSubmitterPublicId(designManholeId: string): Promise<string | null> {
  const client = getPublicLiveClient();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc(
      'get_design_manhole_submitter_public_id' as never,
      { p_design_manhole_id: designManholeId } as never
    );
    if (error) {
      console.warn('Failed to load design manhole submitter:', error);
      return null;
    }
    return typeof data === 'string' && data ? data : null;
  } catch (error) {
    console.warn('Failed to load design manhole submitter:', error);
    return null;
  }
}

// 一覧（/design-manholes）のカード用。1ページで最大48件を引くので、毎回 RPC を投げないようサーバーのメモリに 10 分持つ
// （ページは fetchCache = 'force-no-store' なので unstable_cache は素通りになり使えない）。
// 投稿者が公開をやめたときにリンクが残るのは最大 10 分（リンク先は公開分しか見せないので漏れはない）。
// 詳細ページはすぐ反映させたいので、キャッシュしない loadDesignManholeSubmitterPublicId を使う。
// 失敗はキャッシュに載せない（null は「リンクできない人」として持ってよい）
const SUBMITTER_CACHE_TTL_MS = 10 * 60 * 1000;
const SUBMITTER_CACHE_MAX = 2000;
const submitterPublicIdCache = new Map<string, { value: string | null; expiresAt: number }>();

export async function loadDesignManholeSubmitterPublicIdCached(designManholeId: string): Promise<string | null> {
  const now = Date.now();
  const hit = submitterPublicIdCache.get(designManholeId);
  if (hit && hit.expiresAt > now) return hit.value;

  const client = getPublicLiveClient();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc(
      'get_design_manhole_submitter_public_id' as never,
      { p_design_manhole_id: designManholeId } as never
    );
    if (error) {
      console.warn('Failed to load design manhole submitter:', error);
      return null;
    }
    const value = typeof data === 'string' && data ? data : null;
    if (submitterPublicIdCache.size >= SUBMITTER_CACHE_MAX) submitterPublicIdCache.clear();
    submitterPublicIdCache.set(designManholeId, { value, expiresAt: now + SUBMITTER_CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.warn('Failed to load design manhole submitter:', error);
    return null;
  }
}
