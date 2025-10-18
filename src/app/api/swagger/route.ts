import { NextResponse } from 'next/server';
import { swaggerSpec } from '@/lib/swagger';

/**
 * @swagger
 * /api/swagger:
 *   get:
 *     summary: OpenAPI仕様書を取得 (開発環境のみ)
 *     tags: [swagger]
 *     responses:
 *       200:
 *         description: OpenAPI仕様書 (JSON)
 *       403:
 *         description: 本番環境ではアクセス不可
 */
export async function GET() {
  // 本番環境ではSwagger APIを無効化
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        success: false,
        error: 'API documentation is not available in production'
      },
      { status: 403 }
    );
  }

  return NextResponse.json(swaggerSpec);
}
