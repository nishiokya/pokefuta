import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { SITE_NAME } from '@/lib/constants';
import { renderPokefutaOgpTemplate } from '@/lib/pokefuta-ogp-template';
import {
  loadManholeForOgp,
  loadPhotoForOgp,
  loadFirstPublicPhotoForManhole,
} from '@/lib/manhole-ogp';
import { getManholeLocationLabel, getSortedTitles } from '@/lib/shared-photo';

export const runtime = 'nodejs';

const WIDTH = 1200;
const HEIGHT = 630;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFallbackSvg(locationLabel: string): Buffer {
  const safeLabel = escapeXml(locationLabel.length > 20 ? `${locationLabel.slice(0, 19)}…` : locationLabel);
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#F6EEDC"/>
    <rect x="40" y="40" width="1120" height="550" rx="28" fill="#FFF8EB" stroke="#7B63A8" stroke-opacity="0.22" stroke-width="4"/>
    <text x="100" y="280" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="64" font-weight="900" fill="#4F3828">${safeLabel}のポケふた</text>
    <text x="104" y="360" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="34" font-weight="800" fill="#7B63A8">旅先で見つける全国のポケモンマンホール</text>
    <text x="104" y="420" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="28" font-weight="700" fill="#5D6E68">pokefuta.com</text>
  </svg>`;
  return Buffer.from(svg);
}

function buildDefaultFallback(): Buffer {
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#F6EEDC"/>
    <rect x="40" y="40" width="1120" height="550" rx="28" fill="#FFF8EB" stroke="#7B63A8" stroke-opacity="0.22" stroke-width="4"/>
    <text x="100" y="300" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="72" font-weight="900" fill="#4F3828">${escapeXml(SITE_NAME)}</text>
    <text x="104" y="370" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="34" font-weight="800" fill="#7B63A8">旅先で見つけたポケふたを記録しよう</text>
  </svg>`;
  return Buffer.from(svg);
}

async function renderFallbackPng(svgBuffer: Buffer): Promise<Buffer> {
  return sharp(svgBuffer).png().toBuffer();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const manholeId = Number(params.id);
  if (isNaN(manholeId)) {
    return new Response(await renderFallbackPng(buildDefaultFallback()) as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }

  const manhole = await loadManholeForOgp(manholeId);
  if (!manhole) {
    return new Response(await renderFallbackPng(buildDefaultFallback()) as unknown as BodyInit, {
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
    const png = await renderFallbackPng(buildFallbackSvg(locationLabel));
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
      badgeEmoji: topTitle?.emoji ?? '',
      badgeLabel: topTitle?.label ?? '',
      statsLabel: '全国の旅を記録',
    });

    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Failed to render manhole OGP:', error);
    const png = await renderFallbackPng(buildFallbackSvg(locationLabel));
    return new Response(png as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }
}
