import 'server-only';
import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const TEMPLATE_PATH = path.join(process.cwd(), 'design', 'pokefuta_ogp_template.svg');
const BACKGROUND_PATH = path.join(process.cwd(), 'design', 'pokefuta_ogp_background_1200x630.png');

type PokefutaOgpTemplateInput = {
  photoBuffer: Buffer;
  prefecture: string;
  city: string;
  pokemonNames: string;
  badgeEmoji?: string;
  badgeLabel?: string;
  statsLabel?: string;
};

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

function replaceAll(input: string, search: string, replacement: string): string {
  return input.split(search).join(replacement);
}

async function imageDataUri(buffer: Buffer, mimeType: string): Promise<string> {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function renderPokefutaOgpTemplate(input: PokefutaOgpTemplateInput): Promise<Buffer> {
  const [template, backgroundBuffer, photoBuffer] = await Promise.all([
    readFile(TEMPLATE_PATH, 'utf8'),
    readFile(BACKGROUND_PATH),
    sharp(input.photoBuffer)
      .resize(820, 820, { fit: 'cover' })
      .jpeg({ quality: 88 })
      .toBuffer(),
  ]);

  const photoDataUri = await imageDataUri(photoBuffer, 'image/jpeg');
  const backgroundDataUri = await imageDataUri(backgroundBuffer, 'image/png');
  const badgeLabel = input.badgeLabel || '見つけたポケふた';

  let svg = template;
  svg = replaceAll(svg, './pokefuta_ogp_background_1200x630.png', backgroundDataUri);
  svg = replaceAll(svg, '📷 MY POKEFUTA PHOTO', 'MY POKEFUTA PHOTO');
  svg = replaceAll(svg, '{{photoDataUri}}', photoDataUri);
  svg = replaceAll(svg, '{{prefecture}}', escapeXml(truncate(input.prefecture, 8)));
  svg = replaceAll(svg, '{{city}}', escapeXml(truncate(input.city, 10)));
  svg = replaceAll(svg, '{{pokemonNames}}', escapeXml(truncate(input.pokemonNames, 20)));
  svg = replaceAll(svg, '{{badgeEmoji}}', escapeXml(input.badgeEmoji || '📍'));
  svg = replaceAll(svg, '{{badgeLabel}}', escapeXml(truncate(badgeLabel, 14)));
  svg = replaceAll(
    svg,
    '{{statsLabel}}',
    escapeXml(truncate(input.statsLabel || '全国のポケふた写真をシェア', 28))
  );

  return sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toBuffer();
}
