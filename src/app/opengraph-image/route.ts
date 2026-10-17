import { SITE_NAME } from '@/lib/constants';
import { renderOgpFallback } from '@/lib/pokefuta-ogp-template';

// サイト共通の OG 画像（layout と /design-manholes の OGP_IMAGE_URL）。
// 以前は edge の ImageResponse で、Google Fonts を実行時に取りに行っていたが、本番では
// 500 を返し続けていた（2026-10-17 確認）。他のカードと同じく nodejs で、同梱フォントと
// テンプレートから描く（next.config.js の outputFileTracingIncludes に載せること）。
export const runtime = 'nodejs';

export async function GET() {
  const png = await renderOgpFallback({
    title: SITE_NAME,
    subtitle: '旅先で見つけたポケふたを記録しよう',
  });
  return new Response(png as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
