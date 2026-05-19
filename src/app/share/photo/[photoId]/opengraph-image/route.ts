import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { SITE_NAME } from '@/lib/constants';
import {
  getManholeLocationLabel,
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

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function overlaySvg(title: string, subtitle: string, badge?: string) {
  const safeTitle = escapeXml(truncate(title, 34));
  const safeSubtitle = escapeXml(truncate(subtitle, 58));
  const safeBadge = badge ? escapeXml(truncate(badge, 28)) : '';

  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0.05)" />
          <stop offset="54%" stop-color="rgba(0,0,0,0.15)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.88)" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#shade)" />
      ${safeBadge ? `<rect x="64" y="378" rx="24" ry="24" width="${Math.min(520, 120 + safeBadge.length * 30)}" height="54" fill="#F8D9C4" stroke="#ffffff" stroke-width="3" opacity="0.96" />
      <text x="92" y="414" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="28" font-weight="800" fill="#B5483C">${safeBadge}</text>` : ''}
      <text x="64" y="486" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="62" font-weight="900" fill="#ffffff">${safeTitle}</text>
      <text x="68" y="540" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="30" font-weight="800" fill="rgba(255,255,255,0.88)">${safeSubtitle}</text>
      <text x="68" y="588" font-family="Noto Sans JP, Hiragino Sans, sans-serif" font-size="24" font-weight="800" fill="rgba(255,255,255,0.68)">${escapeXml(SITE_NAME)} / pokefuta.com</text>
    </svg>
  `);
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
    const locationLabel = getManholeLocationLabel(photo.manhole);
    const pokemonText = photo.manhole.pokemons.length > 0
      ? `${photo.manhole.pokemons.join('・')}のポケふた写真`
      : 'ポケふた写真';
    const topTitle = getSortedTitles(photo.manhole.titles)[0];
    const badge = topTitle ? `${topTitle.emoji || ''}${topTitle.label}` : undefined;

    const png = await sharp(input)
      .resize(WIDTH, HEIGHT, { fit: 'cover' })
      .composite([{ input: overlaySvg(`${locationLabel}のポケふた`, pokemonText, badge) }])
      .png()
      .toBuffer();

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
