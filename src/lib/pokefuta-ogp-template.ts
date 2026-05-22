import 'server-only';
import { existsSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import * as opentype from 'opentype.js';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const OGP_FONT_RELATIVE_PATH = path.join('public', 'ogp', 'fonts', 'NotoSansCJKjp-Bold.otf');
const TEMPLATE_RELATIVE_PATH = path.join('public', 'ogp', 'pokefuta_ogp_template.svg');
const BACKGROUND_RELATIVE_PATH = path.join('public', 'ogp', 'pokefuta_ogp_background_1200x630.png');
const OGP_FONT_PATH = resolveOgpAssetPath(OGP_FONT_RELATIVE_PATH);
const TEMPLATE_PATH = resolveOgpAssetPath(TEMPLATE_RELATIVE_PATH);
const BACKGROUND_PATH = resolveOgpAssetPath(BACKGROUND_RELATIVE_PATH);
let ogpFontPromise: Promise<opentype.Font> | null = null;

type PokefutaOgpTemplateInput = {
  photoBuffer: Buffer;
  prefecture: string;
  city: string;
  pokemonNames: string;
  badgeEmoji?: string;
  badgeLabel?: string;
  statsLabel?: string;
};

type TextLayerInput = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  align?: 'left' | 'center' | 'right';
};

export function getOgpFontPath(): string {
  return OGP_FONT_PATH;
}

function resolveOgpAssetPath(relativePath: string): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, relativePath),
    path.resolve(cwd, '.next', relativePath),
    path.resolve(cwd, '..', relativePath),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function assertOgpFontExists(fontPath = OGP_FONT_PATH): void {
  if (!existsSync(fontPath)) {
    throw new Error(`OGP font file is missing: ${fontPath}`);
  }
}

function escapeXmlAttribute(value: string): string {
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

function imageDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

const templateAssetsPromise = Promise.all([
  readFile(TEMPLATE_PATH, 'utf8'),
  readFile(BACKGROUND_PATH),
]).then(([template, backgroundBuffer]) => ({
  template,
  backgroundDataUri: imageDataUri(backgroundBuffer, 'image/png'),
}));

function textTopFromBaseline(baseline: number, fontSize: number): number {
  return Math.max(0, Math.round(baseline - fontSize * 0.9));
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

async function loadOgpFont(): Promise<opentype.Font> {
  assertOgpFontExists();

  ogpFontPromise ??= Promise.resolve().then(() =>
    opentype.parse(bufferToArrayBuffer(readFileSync(OGP_FONT_PATH)))
  );

  return ogpFontPromise;
}

async function renderTextLayer(input: TextLayerInput): Promise<sharp.OverlayOptions> {
  const font = await loadOgpFont();
  let fontSize = input.fontSize;
  let textWidth = font.getAdvanceWidth(input.text, fontSize, { kerning: true });
  if (textWidth > input.width) {
    fontSize = Math.max(12, Math.floor((fontSize * input.width) / textWidth));
    textWidth = font.getAdvanceWidth(input.text, fontSize, { kerning: true });
  }
  const baseline = Math.round(fontSize * 0.9);
  const x =
    input.align === 'center'
      ? Math.max(0, (input.width - textWidth) / 2)
      : input.align === 'right'
        ? Math.max(0, input.width - textWidth)
        : 0;
  const pathData = font.getPath(input.text, x, baseline, fontSize, { kerning: true }).toPathData(2);
  const svg = `<svg width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" xmlns="http://www.w3.org/2000/svg">
    <path d="${escapeXmlAttribute(pathData)}" fill="${escapeXmlAttribute(input.color)}"/>
  </svg>`;
  const inputBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return {
    input: inputBuffer,
    left: input.left,
    top: input.top,
  };
}

async function buildTextLayers(layers: TextLayerInput[]): Promise<sharp.OverlayOptions[]> {
  return Promise.all(layers.map((layer) => renderTextLayer(layer)));
}

async function renderBaseSvg(template: string, replacements: Record<string, string>): Promise<Buffer> {
  let svg = template;
  for (const [search, replacement] of Object.entries(replacements)) {
    svg = replaceAll(svg, search, replacement);
  }

  const fontFaceToken = ['@font', 'face'].join('-');
  if (svg.includes(fontFaceToken)) {
    throw new Error(`OGP SVG must not depend on ${fontFaceToken}`);
  }

  return sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toBuffer();
}

export async function renderPokefutaOgpTemplate(input: PokefutaOgpTemplateInput): Promise<Buffer> {
  const [{ template, backgroundDataUri }, photoBuffer] = await Promise.all([
    templateAssetsPromise,
    sharp(input.photoBuffer)
      .resize(820, 820, { fit: 'cover' })
      .jpeg({ quality: 88 })
      .toBuffer(),
  ]);

  const photoDataUri = imageDataUri(photoBuffer, 'image/jpeg');
  const badgeLabel = input.badgeLabel ?? '見つけたポケふた';
  const cityTitle = `${truncate(input.city, 10)}のポケふた`;
  const statsLabel = truncate(input.statsLabel ?? '全国のポケふた写真をシェア', 28);
  const base = await renderBaseSvg(template, {
    './pokefuta_ogp_background_1200x630.png': backgroundDataUri,
    '{{photoDataUri}}': photoDataUri,
  });

  const textLayers = await buildTextLayers([
    {
      text: 'MY POKEFUTA PHOTO',
      left: 100,
      top: textTopFromBaseline(456, 25),
      width: 285,
      height: 46,
      fontSize: 25,
      color: '#FFFFFF',
    },
    {
      text: truncate(input.prefecture, 8),
      left: 535,
      top: 61,
      width: 205,
      height: 44,
      fontSize: 24,
      color: '#FFFFFF',
      align: 'center',
    },
    {
      text: cityTitle,
      left: 523,
      top: textTopFromBaseline(190, 64),
      width: 650,
      height: 90,
      fontSize: 64,
      color: '#FFFFFF',
    },
    {
      text: cityTitle,
      left: 520,
      top: textTopFromBaseline(185, 64),
      width: 650,
      height: 90,
      fontSize: 64,
      color: '#3A2C22',
    },
    {
      text: truncate(input.pokemonNames, 20),
      left: 528,
      top: textTopFromBaseline(265, 33),
      width: 610,
      height: 54,
      fontSize: 33,
      color: '#17614F',
    },
    {
      text: truncate(badgeLabel, 14),
      left: 560,
      top: textTopFromBaseline(348, 29),
      width: 410,
      height: 52,
      fontSize: 29,
      color: '#17614F',
    },
    {
      text: '旅先で見つける、全国のポケふたマップ',
      left: 520,
      top: textTopFromBaseline(440, 31),
      width: 640,
      height: 56,
      fontSize: 31,
      color: '#2F241C',
    },
    {
      text: '旅行・お出かけ・聖地巡りのお供に！',
      left: 90,
      top: textTopFromBaseline(585, 24),
      width: 390,
      height: 44,
      fontSize: 24,
      color: '#FFFFFF',
    },
    {
      text: statsLabel,
      left: 520,
      top: textTopFromBaseline(585, 25),
      width: 370,
      height: 44,
      fontSize: 25,
      color: '#FFFFFF',
    },
    {
      text: 'pokefuta.com',
      left: 900,
      top: textTopFromBaseline(586, 25),
      width: 224,
      height: 44,
      fontSize: 25,
      color: '#17614F',
      align: 'center',
    },
  ]);

  return sharp(base).composite(textLayers).png().toBuffer();
}

export async function renderOgpFallback(input: {
  title: string;
  subtitle: string;
  siteLabel?: string;
}): Promise<Buffer> {
  const baseSvg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#F6EEDC"/>
    <rect x="40" y="40" width="1120" height="550" rx="28" fill="#FFF8EB" stroke="#7B63A8" stroke-opacity="0.22" stroke-width="4"/>
  </svg>`;
  const base = await sharp(Buffer.from(baseSvg)).png().toBuffer();
  const textLayers = await buildTextLayers([
    {
      text: truncate(input.title, 24),
      left: 100,
      top: textTopFromBaseline(300, 64),
      width: 980,
      height: 90,
      fontSize: 64,
      color: '#4F3828',
    },
    {
      text: truncate(input.subtitle, 34),
      left: 104,
      top: textTopFromBaseline(370, 34),
      width: 980,
      height: 58,
      fontSize: 34,
      color: '#7B63A8',
    },
    {
      text: input.siteLabel ?? 'pokefuta.com',
      left: 104,
      top: textTopFromBaseline(430, 28),
      width: 520,
      height: 48,
      fontSize: 28,
      color: '#5D6E68',
    },
  ]);

  return sharp(base).composite(textLayers).png().toBuffer();
}
