import 'server-only';
import { getPublicLiveClient } from '@/lib/user-prefecture-progress';

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
