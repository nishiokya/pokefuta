import 'server-only';
import { fetchManholeSnapshot, type SnapshotManhole } from '@/lib/manhole-snapshot';
import { buildManholeDetail, type ManholeDetailDerived } from '@/lib/manhole-detail';

export type ManholeDetailPayload = ManholeDetailDerived & {
  manhole: SnapshotManhole;
};

export type ManholeDetailResult =
  | { ok: true; payload: ManholeDetailPayload }
  // 'unavailable' = スナップショットが引けない（一時的な障害。呼び出し側は 503）
  // 'not-found'   = スナップショットは引けたがその id が無い（404）
  | { ok: false; reason: 'unavailable' | 'not-found' };

/**
 * 詳細ページ1枚ぶんの素材（蓋そのもの＋統計バッジ・関連する蓋）。
 *
 * **サーバ描画と単体GETの両方がここを通る。** 詳細ページはサーバで初期HTMLを
 * 組み立て、クライアントは同じ形を `/api/manholes/{id}` から受け取る。別々に
 * 組み立てると、初期HTMLと再取得後で中身が食い違う余地ができる。
 *
 * 失敗を単なる null で返さないのは、**「一時的に引けない」と「その蓋が無い」を
 * 呼び出し側が区別できなくなる**ため。潰すと、スナップショット障害のときに
 * 404 を返して「その蓋は存在しない」と嘘をつくことになる。
 *
 * 訪問状態（`is_visited`）はここでは重ねない。ログイン利用者ごとに違う値なので、
 * サーバ描画に混ぜると人によって違うHTMLになる。匿名相当のまま返し、
 * 重ね合わせは単体GET（`/api/manholes/{id}`）の側だけで行う。
 */
export async function loadManholeDetail(manholeId: number): Promise<ManholeDetailResult> {
  const snapshot = await fetchManholeSnapshot();
  if (!snapshot?.manholes) return { ok: false, reason: 'unavailable' };

  const manhole = snapshot.manholes.find((m) => m.id === manholeId);
  if (!manhole) return { ok: false, reason: 'not-found' };

  return { ok: true, payload: { manhole, ...buildManholeDetail(manhole, snapshot.manholes) } };
}
