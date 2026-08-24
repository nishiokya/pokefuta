import { NextRequest, NextResponse } from 'next/server';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import { buildManholeDetail } from '@/lib/manhole-detail';

// スラッグ名は同じ階層の `comments` / `context-images` に合わせて `manholeId`。
// Next.js は同一パスで別名のスラッグを許さない（`[id]` にするとビルドが落ちる）。
/**
 * @swagger
 * /api/manholes/{manholeId}:
 *   get:
 *     summary: マンホール1枚と、その詳細ページに必要な派生値を取得
 *     tags: [manholes]
 *     description: >
 *       詳細ページ用の単体GET。蓋そのものに加えて、統計（都道府県内の枚数・同じ
 *       ポケモンの枚数・30km以内の件数）と、関連する蓋（次に寄れる／同じポケモン）を
 *       ラベル込みで返す。マスターデータは data.pokefuta.com の静的スナップショット
 *       （日次更新）から取得する。
 *     parameters:
 *       - in: path
 *         name: manholeId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: マンホール1枚 + 派生値 }
 *       400: { description: manholeId が整数でない }
 *       404: { description: 該当なし }
 *       503: { description: スナップショット取得失敗 }
 */

// 詳細ページの取得元。**全件を返す `/api/manholes` の代わり**にこれを使う。
//
// 以前は1枚見るために全482件・730KB を落としてから find で1件を探し、
// 近傍・同じポケモン・統計もクライアントで計算していた。全国分を運んで
// 1枚を表示していたことになる。ここで必要なぶんだけ返す。
export async function GET(
  _request: NextRequest,
  { params }: { params: { manholeId: string } }
) {
  try {
    // 前方一致で数字を拾う parseInt は使わない。`1foo` や `1.9` が黙って 1 になる
    if (!/^\d+$/.test(params.manholeId)) {
      return NextResponse.json(
        { error: 'manholeId must be a positive integer' },
        { status: 400 }
      );
    }
    const manholeId = Number(params.manholeId);

    const snapshot = await fetchManholeSnapshot();
    if (!snapshot?.manholes) {
      return NextResponse.json(
        { error: 'Manhole data is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    const manhole = snapshot.manholes.find((m) => m.id === manholeId);
    if (!manhole) {
      return NextResponse.json({ error: 'Manhole not found' }, { status: 404 });
    }

    const derived = buildManholeDetail(manhole, snapshot.manholes);

    return NextResponse.json({
      success: true,
      manhole,
      ...derived,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
