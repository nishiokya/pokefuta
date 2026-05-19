import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { SITE_NAME } from '@/lib/constants';
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

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildCardSvg(input: {
  prefecture: string;
  city: string;
  pokemonNames: string;
  badgeEmoji: string;
  badgeLabel: string;
  photoDataUri: string;
}): string {
  const safePref = escapeXml(truncate(input.prefecture, 8));
  const safeCity = escapeXml(truncate(input.city, 10));
  const safePokemons = escapeXml(truncate(input.pokemonNames, 20));
  const safeBadgeEmoji = escapeXml(input.badgeEmoji);
  const safeBadgeLabel = escapeXml(truncate(input.badgeLabel, 14));
  const hasBadge = safeBadgeLabel.length > 0;

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFF7E6"/>
      <stop offset="100%" stop-color="#EAF5EF"/>
    </linearGradient>
    <clipPath id="photoClip">
      <rect x="70" y="70" width="470" height="470" rx="42"/>
    </clipPath>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <path d="M770 60 C910 120 1000 90 1130 170" fill="none" stroke="#D9E7D8" stroke-width="18" stroke-linecap="round"/>
  <path d="M700 520 C840 450 930 545 1110 455" fill="none" stroke="#E6D8B8" stroke-width="16" stroke-linecap="round"/>
  <circle cx="1040" cy="110" r="70" fill="#FFFFFF" opacity="0.45"/>
  <circle cx="1080" cy="500" r="110" fill="#FFFFFF" opacity="0.35"/>

  <rect x="76" y="76" width="470" height="470" rx="42" fill="#00000022"/>
  <rect x="70" y="70" width="470" height="470" rx="42" fill="#FFFFFF"/>
  <image href="${input.photoDataUri}" x="70" y="70" width="470" height="470" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>

  <rect x="590" y="86" width="180" height="44" rx="22" fill="#2F6F5E"/>
  <text x="680" y="116" text-anchor="middle" font-size="24" font-weight="700" fill="#FFFFFF" font-family="Noto Sans JP, Hiragino Sans, sans-serif">${safePref}</text>

  <text x="590" y="185" font-size="48" font-weight="800" fill="#25332F" font-family="Noto Sans JP, Hiragino Sans, sans-serif">${safeCity}のポケふた</text>
  <text x="590" y="245" font-size="34" font-weight="700" fill="#4A5E57" font-family="Noto Sans JP, Hiragino Sans, sans-serif">${safePokemons}</text>

  ${hasBadge ? `<rect x="590" y="278" width="440" height="64" rx="32" fill="#FFFFFF" opacity="0.92"/>
  <text x="622" y="320" font-size="30" font-weight="800" fill="#2F6F5E" font-family="Noto Sans JP, Hiragino Sans, sans-serif">${safeBadgeEmoji} ${safeBadgeLabel}</text>` : ''}

  <text x="590" y="440" font-size="28" font-weight="700" fill="#25332F" font-family="Noto Sans JP, Hiragino Sans, sans-serif">旅先で見つける全国のポケふたマップ</text>

  <rect x="590" y="505" width="250" height="54" rx="27" fill="#25332F"/>
  <text x="715" y="541" text-anchor="middle" font-size="26" font-weight="800" fill="#FFFFFF" font-family="Noto Sans JP, Hiragino Sans, sans-serif">pokefuta.com</text>
</svg>`;
}

function buildFallbackSvg(locationLabel: string): Buffer {
  const safeLabel = escapeXml(truncate(locationLabel, 20));
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
    const jpegBuffer = await sharp(imageBuffer)
      .resize(470, 470, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
    const photoDataUri = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

    const topTitle = getSortedTitles(manhole.titles)[0];
    const city = manhole.municipality || manhole.prefecture;
    const pokemonNames = manhole.pokemons.slice(0, 3).join('・');

    const svgString = buildCardSvg({
      prefecture: manhole.prefecture,
      city,
      pokemonNames,
      badgeEmoji: topTitle?.emoji ?? '',
      badgeLabel: topTitle?.label ?? '',
      photoDataUri,
    });

    const png = await sharp(Buffer.from(svgString)).png().toBuffer();

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
