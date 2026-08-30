import { fetchManholeSnapshot, type SnapshotManhole } from '@/lib/manhole-snapshot';
import { buildManholeDetail, type ManholeDetailDerived } from '@/lib/manhole-detail';

export type ManholeDetailPayload = ManholeDetailDerived & {
  manhole: SnapshotManhole;
};

/**
 * 詳細ページ1枚ぶんの素材（蓋そのもの＋統計バッジ・関連する蓋）。
 *
 * **サーバ描画と単体GETの両方がここを通る。** 詳細ページはサーバで初期HTMLを
 * 組み立て、クライアントは同じ形を `/api/manholes/{id}` から受け取る。別々に
 * 組み立てると、初期HTMLと再取得後で中身が食い違う余地ができる。
 *
 * 訪問状態（`is_visited`）はここでは重ねない。ログイン利用者ごとに違う値なので、
 * サーバ描画に混ぜると人によって違うHTMLになる。匿名相当のまま返し、
 * 重ね合わせは単体GET（`/api/manholes/{id}`）の側だけで行う。
 */
export async function loadManholeDetailPayload(
  manholeId: number
): Promise<ManholeDetailPayload | null> {
  const snapshot = await fetchManholeSnapshot();
  if (!snapshot?.manholes) return null;

  const manhole = snapshot.manholes.find((m) => m.id === manholeId);
  if (!manhole) return null;

  return { manhole, ...buildManholeDetail(manhole, snapshot.manholes) };
}
