import { renderDesignManholeOgpTemplate, renderOgpFallback } from '@/lib/pokefuta-ogp-template';
import { loadDesignManholeForOgp } from '@/lib/design-manhole-ogp';

export const runtime = 'nodejs';
// hidden 化した投稿のOGPが Data Cache 経由で配信され続けないようにする
export const fetchCache = 'force-no-store';

function buildFallback(): Promise<Buffer> {
  return renderOgpFallback({
    title: 'みんなのデザインマンホール',
    subtitle: 'ご当地デザインマンホールをみんなで集めよう',
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const designManhole = await loadDesignManholeForOgp(params.id, { includeSignedUrl: true });

  if (!designManhole?.signed_url) {
    return new Response(await buildFallback() as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    const imageResponse = await fetch(designManhole.signed_url);
    if (!imageResponse.ok) throw new Error(`Photo fetch failed: ${imageResponse.status}`);

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const png = await renderDesignManholeOgpTemplate({
      photoBuffer: imageBuffer,
      title: designManhole.title || 'デザインマンホール',
      submitterName: designManhole.submitter_name,
    });

    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Failed to render design manhole OGP:', error);
    return new Response(await buildFallback() as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }
}
