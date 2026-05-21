import { NextRequest } from 'next/server';
import { SITE_NAME } from '@/lib/constants';
import { renderOgpFallback, renderPokefutaOgpTemplate } from '@/lib/pokefuta-ogp-template';
import {
  getSortedTitles,
  loadPublicSharedPhoto,
} from '@/lib/shared-photo';

export const runtime = 'nodejs';

async function fallbackImage() {
  return renderOgpFallback({
    title: SITE_NAME,
    subtitle: '旅先で見つけたポケふたを記録しよう',
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { photoId: string } }
) {
  const photo = await loadPublicSharedPhoto(params.photoId, { includeSignedUrl: true });

  if (!photo) {
    return new Response(await fallbackImage() as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  try {
    if (!photo.signed_url) throw new Error('Signed URL unavailable');

    const imageResponse = await fetch(photo.signed_url);
    if (!imageResponse.ok) throw new Error(`Photo fetch failed: ${imageResponse.status}`);

    const input = Buffer.from(await imageResponse.arrayBuffer());
    const pokemonText = photo.manhole.pokemons.length > 0
      ? photo.manhole.pokemons.join('・')
      : 'ポケふた写真';
    const topTitle = getSortedTitles(photo.manhole.titles)[0];
    const png = await renderPokefutaOgpTemplate({
      photoBuffer: input,
      prefecture: photo.manhole.prefecture,
      city: photo.manhole.municipality || photo.manhole.prefecture,
      pokemonNames: pokemonText,
      badgeEmoji: topTitle?.emoji,
      badgeLabel: topTitle?.label,
      statsLabel: '写真で旅をシェア',
    });

    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Failed to render shared photo OGP:', error);
    return new Response(await fallbackImage() as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
}
