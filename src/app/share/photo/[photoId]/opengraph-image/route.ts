import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { SITE_NAME } from '@/lib/constants';
import { renderPokefutaOgpTemplate } from '@/lib/pokefuta-ogp-template';
import {
  getSortedTitles,
  loadPublicSharedPhoto,
} from '@/lib/shared-photo';

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

async function fallbackImage() {
  const svg = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#F6EEDC" />
      <rect x="40" y="40" width="1120" height="550" rx="28" fill="#FFF8EB" stroke="#7B63A8" stroke-opacity="0.22" stroke-width="4" />
      <text x="100" y="300" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="72" font-weight="900" fill="#4F3828">${escapeXml(SITE_NAME)}</text>
      <text x="104" y="370" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="34" font-weight="800" fill="#7B63A8">旅先で見つけたポケふたを記録しよう</text>
    </svg>
  `);
  return sharp(svg).png().toBuffer();
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
