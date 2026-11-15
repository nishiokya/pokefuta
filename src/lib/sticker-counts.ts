import 'server-only';
import { getPublicLiveClient } from '@/lib/user-prefecture-progress';

// 画面の一覧は件数で切れているので、ステッカーの数はDBで全件を数える。
// 取り下げ（非公開に戻す）がすぐ効くようキャッシュに載せない。取れなければ 0（ステッカーが出ないだけ）

async function loadPublicVisitCount(rpc: string, publicUserId: string): Promise<number> {
  const client = getPublicLiveClient();
  if (!client) return 0;
  try {
    const { data, error } = await client.rpc(rpc as never, { p_user_id: publicUserId } as never);
    if (error) {
      console.warn(`Failed to load ${rpc}:`, error);
      return 0;
    }
    return typeof data === 'number' && data > 0 ? data : 0;
  } catch (error) {
    console.warn(`Failed to load ${rpc}:`, error);
    return 0;
  }
}

/** 公開IDの人の公開訪問のうち、ぬいぐるみが写った訪問の数 */
export function loadPublicPlushVisitCount(publicUserId: string): Promise<number> {
  return loadPublicVisitCount('get_public_plush_visit_count', publicUserId);
}

/** 公開IDの人の公開訪問のうち、雪が写った訪問の数 */
export function loadPublicSnowVisitCount(publicUserId: string): Promise<number> {
  return loadPublicVisitCount('get_public_snow_visit_count', publicUserId);
}
