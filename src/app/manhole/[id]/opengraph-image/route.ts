import { NextRequest } from 'next/server';
import { SITE_NAME } from '@/lib/constants';
import { renderOgpFallback, renderPokefutaOgpTemplate } from '@/lib/pokefuta-ogp-template';
import {
  loadManholeForOgp,
  loadPhotoForOgp,
  loadFirstPublicPhotoForManhole,
} from '@/lib/manhole-ogp';
import { getManholeLocationLabel, getSortedTitles } from '@/lib/shared-photo';

export const runtime = 'nodejs';

function buildDefaultFallback(): Promise<Buffer> {
  return renderOgpFallback({
    title: SITE_NAME,
    subtitle: '旅先で見つけたポケふたを記録しよう',
  });
}

function buildFallback(locationLabel: string): Promise<Buffer> {
  return renderOgpFallback({
    title: `${locationLabel}のポケふた`,
    subtitle: '旅先で見つける全国のポケモンマンホール',
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const manholeId = Number(params.id);
  if (isNaN(manholeId)) {
    return new Response(await buildDefaultFallback() as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }

  const manhole = await loadManholeForOgp(manholeId);
  if (!manhole) {
    return new Response(await buildDefaultFallback() as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }

  const locationLabel = getManholeLocationLabel(manhole);
  const photoIdParam = request.nextUrl.searchParams.get('photo');

  let photo = null;
  if (photoIdParam) {
    photo = await loadPhotoForOgp(photoIdParam, manholeId, { includeSignedUrl: true });
  }
  if (!photo) {
    photo = await loadFirstPublicPhotoForManhole(manholeId, { includeSignedUrl: true });
  }

  if (!photo?.signed_url) {
    const png = await buildFallback(locationLabel);
    return new Response(png as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  }

  try {
    const imageResponse = await fetch(photo.signed_url);
    if (!imageResponse.ok) throw new Error(`Photo fetch failed: ${imageResponse.status}`);

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const topTitle = getSortedTitles(manhole.titles)[0];
    const city = manhole.municipality || manhole.prefecture;
    const pokemonNames = manhole.pokemons.slice(0, 3).join('・');

    const png = await renderPokefutaOgpTemplate({
      photoBuffer: imageBuffer,
      prefecture: manhole.prefecture,
      city,
      pokemonNames,
      badgeLabel: topTitle ? topTitle.label : '',
    });

    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Failed to render manhole OGP:', error);
    const png = await buildFallback(locationLabel);
    return new Response(png as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }
}
