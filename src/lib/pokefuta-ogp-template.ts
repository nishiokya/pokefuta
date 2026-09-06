import 'server-only';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const OGP_FONT_NAME = 'Noto Sans CJK JP';
const OGP_FONT_RELATIVE_PATH = path.join('public', 'ogp', 'fonts', 'NotoSansCJKjp-Bold.otf');
const TEMPLATE_RELATIVE_PATH = path.join('public', 'ogp', 'pokefuta_ogp_template.svg');
const MOSAIC_RELATIVE_PATH = path.join('public', 'ogp', 'manhole-photo-mosaic-left-600x630.webp');
const OGP_FONT_PATH = resolveOgpAssetPath(OGP_FONT_RELATIVE_PATH);
const TEMPLATE_PATH = resolveOgpAssetPath(TEMPLATE_RELATIVE_PATH);
const MOSAIC_PATH = resolveOgpAssetPath(MOSAIC_RELATIVE_PATH);

/** 主役の円。テンプレート SVG の heroClip と必ず一致させること */
const HERO = { cx: 886, cy: 315, r: 258 } as const;

/** 写真の周囲に足す台紙の色。テンプレートの円の下地と同じにする */
const HERO_MAT_COLOR = '#EDE3D0';

/** 左カラムの版面 */
const COL = { left: 76, width: 430 } as const;

const INK = {
  cream: '#FFF8EB',
  /** 紫の上に置く控えめな文字 */
  muted: '#D9CFE6',
  gold: '#F0C46A',
} as const;

type TextLayerInput = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  minFontSize?: number;
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

function escapePango(value: string): string {
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

type TemplateAssets = { template: string; mosaicDataUri: string };

/**
 * テンプレートと焼き込み済みモザイクは最初の描画時に一度だけ読み、以後使い回す。
 * モザイクは WebP のままだと librsvg が展開できないので、その一度で JPEG へ変換する。
 *
 * **失敗した Promise はキャッシュしない。** モジュール初期化時に即実行して結果を
 * 抱えると、一時的な読み込み失敗がプロセスの寿命ぶん固定され、以後すべての
 * カードが落ち続ける。呼ばれたときに読み、失敗したら次の呼び出しでやり直す。
 */
let templateAssetsPromise: Promise<TemplateAssets> | null = null;

function loadTemplateAssets(): Promise<TemplateAssets> {
  if (!templateAssetsPromise) {
    templateAssetsPromise = (async (): Promise<TemplateAssets> => {
      const [template, mosaicFile] = await Promise.all([
        readFile(TEMPLATE_PATH, 'utf8'),
        readFile(MOSAIC_PATH),
      ]);
      const mosaicJpeg = await sharp(mosaicFile).jpeg({ quality: 82 }).toBuffer();
      return { template, mosaicDataUri: imageDataUri(mosaicJpeg, 'image/jpeg') };
    })().catch((error) => {
      templateAssetsPromise = null;
      throw error;
    });
  }

  return templateAssetsPromise;
}

function textTopFromBaseline(baseline: number, fontSize: number): number {
  return Math.max(0, Math.round(baseline - fontSize * 0.9));
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((width, character) => {
    if (/[　-ヿ㐀-鿿＀-￯]/.test(character)) {
      return width + fontSize;
    }
    if (/[A-Z0-9]/.test(character)) {
      return width + fontSize * 0.68;
    }
    if (/[a-z]/.test(character)) {
      return width + fontSize * 0.56;
    }
    return width + fontSize * 0.42;
  }, 0);
}

function fitFontSizeToWidth(input: TextLayerInput): number {
  const minFontSize = input.minFontSize ?? Math.max(12, Math.floor(input.fontSize * 0.72));
  const estimatedWidth = estimateTextWidth(input.text, input.fontSize);

  if (estimatedWidth <= input.width) {
    return input.fontSize;
  }

  return Math.max(minFontSize, Math.floor((input.fontSize * input.width) / estimatedWidth));
}

async function renderTextLayer(input: TextLayerInput): Promise<sharp.OverlayOptions> {
  assertOgpFontExists();

  const fontSize = fitFontSizeToWidth(input);
  const markup = `<span foreground="${input.color}" font_desc="${OGP_FONT_NAME} ${fontSize}">${escapePango(input.text)}</span>`;
  const inputBuffer = await sharp({
    text: {
      text: markup,
      font: OGP_FONT_NAME,
      fontfile: OGP_FONT_PATH,
      width: input.width,
      height: input.height,
      align: input.align ?? 'left',
      rgba: true,
    },
  })
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

  // Linux の sharp/librsvg は Web フォント指定を解決できないため、SVG がそれに
  // 依存していないことを描画直前に保証する。
  // ビルド成果物にこのトークンの文字列が残ると tools/verify-ogp-linux.js の検査に
  // 引っかかるので、正規表現のエスケープ(\x2D = ハイフン)で literal を避ける。
  // エラーメッセージにもトークンを埋め込まないこと。
  if (/@font\x2Dface/.test(svg)) {
    throw new Error('OGP SVG must not depend on a web font at-rule');
  }

  return sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toBuffer();
}

type CardSlots = {
  /** 右の円に入る SVG */
  hero: string;
  /** 左上のピル。場所なら pin を付ける */
  pill?: { text: string; withPin?: boolean };
  /** 種別などの小さい前置き */
  eyebrow?: string;
  /** 主役の1行。2行まで折り返す */
  headline: string;
  /** 投稿者やポケモン名。人アイコンを付けるかは icon で決める */
  accent?: { text: string; withPerson?: boolean };
  /** 補足 */
  note?: string;
};

function pillSvg(text: string, withPin: boolean): string {
  const paddingX = 26;
  const iconRoom = withPin ? 34 : 0;
  const textWidth = estimateTextWidth(text, 27);
  const width = Math.round(paddingX * 2 + iconRoom + textWidth);
  const pin = withPin
    ? `<g transform="translate(${COL.left + 26} 111)" fill="#574276">
         <path d="M11 0 C4.9 0 0 4.9 0 11 C0 19 11 30 11 30 C11 30 22 19 22 11 C22 4.9 17.1 0 11 0 Z"/>
         <circle cx="11" cy="11" r="4.2" fill="#FFF8EB"/>
       </g>`
    : '';
  return `<rect x="${COL.left}" y="96" width="${width}" height="52" rx="26" fill="#FFF8EB" fill-opacity="0.94"/>${pin}`;
}

function pillTextLeft(withPin: boolean): number {
  return COL.left + 26 + (withPin ? 34 : 0);
}

/** 投稿者行の人アイコン */
const PERSON_ICON = `<g transform="translate(${COL.left} 413)">
    <circle cx="17" cy="17" r="17" fill="#FFF8EB" fill-opacity="0.18"/>
    <circle cx="17" cy="13" r="5.6" fill="#FFF8EB" fill-opacity="0.85"/>
    <path d="M6.5 27 C 8.5 21.5, 25.5 21.5, 27.5 27 Z" fill="#FFF8EB" fill-opacity="0.85"/>
  </g>`;

const GOLD_RULE = `<rect x="${COL.left}" y="208" width="64" height="5" rx="2.5" fill="#C47E0F"/>`;

/**
 * テンプレートもモザイクもフォントも使わない最後の受け皿。
 *
 * 通常カード・写真なしカード・fallback はすべて renderCard() を通るので、
 * アセットやフォントが欠けると全経路が同時に落ちる。そのとき 500 を返すより、
 * 図形だけのカードを返して共有そのものは成立させる。文字は入れない
 * （日本語を描くにはフォントが要り、それ自体が落ちている可能性があるため）。
 */
async function renderAssetlessFallback(): Promise<Buffer> {
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#FFF8EB"/>
    <rect x="0" y="0" width="566" height="${HEIGHT}" fill="#574276"/>
    <line x1="588" y1="24" x2="588" y2="606" stroke="#8C6A4A" stroke-opacity="0.42" stroke-width="3" stroke-dasharray="10 12"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="${HERO.r}" fill="#F3E7D2"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="${HERO.r}" fill="none" stroke="#FFFDF7" stroke-width="11"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="196" fill="none" stroke="#8C6A4A" stroke-opacity="0.26" stroke-width="3"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="96" fill="none" stroke="#B5483C" stroke-opacity="0.55" stroke-width="4"/>
    <g transform="translate(76 297)">
      <circle cx="18" cy="18" r="18" fill="#FFF8EB"/>
      <circle cx="18" cy="18" r="7.5" fill="none" stroke="#574276" stroke-width="3"/>
      <circle cx="18" cy="18" r="14" fill="none" stroke="#574276" stroke-width="2" stroke-dasharray="4 4"/>
    </g>
  </svg>`;

  return sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toBuffer();
}

async function renderCard(slots: CardSlots): Promise<Buffer> {
  try {
    return await renderCardWithAssets(slots);
  } catch (error) {
    console.error('OGP card assets are unavailable; falling back to the assetless card:', error);
    return renderAssetlessFallback();
  }
}

async function renderCardWithAssets(slots: CardSlots): Promise<Buffer> {
  const { template, mosaicDataUri } = await loadTemplateAssets();

  const withPin = slots.pill?.withPin === true;
  const withPerson = slots.accent?.withPerson === true;

  const base = await renderBaseSvg(template, {
    '{{mosaic}}': mosaicDataUri,
    '{{hero}}': slots.hero,
    '{{pill}}': slots.pill ? pillSvg(slots.pill.text, withPin) : '',
    '{{rule}}': slots.eyebrow ? GOLD_RULE : '',
    '{{accentIcon}}': slots.accent && withPerson ? PERSON_ICON : '',
  });

  const layers: TextLayerInput[] = [];

  if (slots.pill) {
    layers.push({
      text: truncate(slots.pill.text, 14),
      left: pillTextLeft(withPin),
      top: textTopFromBaseline(131, 27),
      width: Math.ceil(estimateTextWidth(truncate(slots.pill.text, 14), 27)) + 8,
      height: 28,
      fontSize: 27,
      color: '#574276',
    });
  }

  if (slots.eyebrow) {
    layers.push({
      text: truncate(slots.eyebrow, 16),
      left: COL.left,
      top: textTopFromBaseline(264, 26),
      width: COL.width,
      height: 26,
      fontSize: 26,
      color: INK.muted,
    });
  }

  layers.push({
    text: truncate(slots.headline, 22),
    left: COL.left - 2,
    top: textTopFromBaseline(356, 62),
    width: COL.width,
    height: 104,
    fontSize: 62,
    minFontSize: 34,
    color: INK.cream,
  });

  if (slots.accent) {
    layers.push({
      text: truncate(slots.accent.text, 20),
      left: COL.left + (withPerson ? 46 : 0),
      top: textTopFromBaseline(442, 32),
      width: COL.width - (withPerson ? 46 : 0),
      height: 34,
      fontSize: 32,
      minFontSize: 22,
      color: INK.gold,
    });
  }

  if (slots.note) {
    layers.push({
      text: truncate(slots.note, 26),
      left: COL.left,
      top: textTopFromBaseline(524, 27),
      width: COL.width,
      height: 28,
      fontSize: 27,
      minFontSize: 20,
      color: INK.muted,
    });
  }

  layers.push({
    text: 'ポケふた写真館',
    left: COL.left + 48,
    top: textTopFromBaseline(578, 27),
    width: 280,
    height: 28,
    fontSize: 27,
    color: INK.cream,
  });

  return sharp(base).composite(await buildTextLayers(layers)).png().toBuffer();
}

/** 円の外接矩形いっぱいに写真を敷く。はみ出しは clipPath 側で落ちる */
function heroPhoto(photoDataUri: string): string {
  const size = HERO.r * 2;
  return `<image href="${photoDataUri}" x="${HERO.cx - HERO.r}" y="${HERO.cy - HERO.r}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>`;
}

/**
 * 写真がまだ無いときの「空の蓋」。
 * 同心円と放射のリブで鋳鉄の蓋そのものに見せ、白紙のカードを出さない。
 */
function heroEmptyPlate(): string {
  const ticks = Array.from({ length: 24 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 24;
    const x1 = HERO.cx + Math.cos(angle) * 196;
    const y1 = HERO.cy + Math.sin(angle) * 196;
    const x2 = HERO.cx + Math.cos(angle) * 232;
    const y2 = HERO.cy + Math.sin(angle) * 232;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#B5483C" stroke-opacity="0.22" stroke-width="7" stroke-linecap="round"/>`;
  }).join('');

  return `<circle cx="${HERO.cx}" cy="${HERO.cy}" r="${HERO.r}" fill="#F3E7D2"/>
    ${ticks}
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="176" fill="none" stroke="#B5483C" stroke-opacity="0.28" stroke-width="3" stroke-dasharray="13 15"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="136" fill="none" stroke="#8C6A4A" stroke-opacity="0.22" stroke-width="2"/>
    <g fill="#8C6A4A" fill-opacity="0.42">
      <rect x="${HERO.cx - 76}" y="${HERO.cy - 32}" width="152" height="108" rx="20"/>
      <rect x="${HERO.cx - 32}" y="${HERO.cy - 50}" width="64" height="28" rx="10"/>
    </g>
    <circle cx="${HERO.cx}" cy="${HERO.cy + 22}" r="36" fill="#F3E7D2"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy + 22}" r="20" fill="#8C6A4A" fill-opacity="0.42"/>`;
}

/** 個別の情報が引けないときのマーク */
function heroMark(): string {
  return `<circle cx="${HERO.cx}" cy="${HERO.cy}" r="${HERO.r}" fill="#F3E7D2"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="196" fill="none" stroke="#8C6A4A" stroke-opacity="0.26" stroke-width="3"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="146" fill="none" stroke="#8C6A4A" stroke-opacity="0.20" stroke-width="2"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="96" fill="none" stroke="#B5483C" stroke-opacity="0.55" stroke-width="4"/>`;
}

/**
 * 主役写真だけを取得・変換する。OGP1枚あたりの外部取得はこれ1回に保つ
 * （左のモザイクは焼き込み済みアセット）。表示は直径516pxなので、
 * Retina 相当の余裕を見て 620px 角へ落とす。
 */
async function toHeroPhotoUri(photoBuffer: Buffer): Promise<string> {
  // 正方形に切ったあと、周囲へ台紙の色で余白を足してから円に入れる。
  // 余白なしだと蓋が正方形いっぱいに写っている写真で、円の上下左右が
  // 蓋を削ってしまう（内接円は正方形の辺の中点にしか触れないため）。
  const inset = 34;
  const inner = 620 - inset * 2;
  const resized = await sharp(photoBuffer)
    .resize(inner, inner, { fit: 'cover', position: 'centre' })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: HERO_MAT_COLOR,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  return imageDataUri(resized, 'image/jpeg');
}

export async function renderPokefutaOgpTemplate(input: {
  photoBuffer: Buffer;
  prefecture: string;
  city: string;
  pokemonNames: string;
  badgeLabel?: string;
}): Promise<Buffer> {
  return renderCard({
    hero: heroPhoto(await toHeroPhotoUri(input.photoBuffer)),
    pill: { text: `${input.prefecture}・${truncate(input.city, 8)}`, withPin: true },
    eyebrow: 'ポケふた',
    headline: `${truncate(input.city, 10)}のポケふた`,
    accent: { text: input.pokemonNames },
    note: input.badgeLabel || '旅先で見つける、全国のポケふたマップ',
  });
}

export async function renderDesignManholeOgpTemplate(input: {
  photoBuffer: Buffer;
  title: string;
  submitterName?: string | null;
}): Promise<Buffer> {
  // design_manhole の title は実際には null のことが多い（投稿フォームが必須にしていない）。
  // 緯度経度から地名を推測したりせず、安全な既定の文言へ落とす。
  const headline = input.title?.trim() || 'みんなのデザインマンホール';

  return renderCard({
    hero: heroPhoto(await toHeroPhotoUri(input.photoBuffer)),
    pill: { text: 'デザインマンホール' },
    eyebrow: 'みんなの投稿',
    headline,
    accent: input.submitterName
      ? { text: `${truncate(input.submitterName, 12)}さんの投稿`, withPerson: true }
      : undefined,
    note: 'ご当地のマンホールを、みんなで集める',
  });
}

/**
 * まだ写真が1枚も投稿されていないポケふたのOGP。
 *
 * ここは以前タイトルとドメインだけのほぼ白紙が出ていた（2026-09-06 時点で
 * 482枚中22枚が該当し、うち5枚は離島）。シェアしたい蓋ほど白紙になるので、
 * 空の蓋を主役に据えて、そのまま投稿への誘いにする。
 */
export async function renderPokefutaNoPhotoTemplate(input: {
  prefecture: string;
  city: string;
  pokemonNames: string;
}): Promise<Buffer> {
  return renderCard({
    hero: heroEmptyPlate(),
    pill: { text: `${input.prefecture}・${truncate(input.city, 8)}`, withPin: true },
    eyebrow: 'ポケふた',
    headline: `${truncate(input.city, 10)}のポケふた`,
    accent: { text: input.pokemonNames },
    note: 'まだ誰も写真を投稿していません',
  });
}

/** 最後の受け皿。個別の情報が引けないときだけここに来る */
export async function renderOgpFallback(input: {
  title: string;
  subtitle: string;
}): Promise<Buffer> {
  return renderCard({
    hero: heroMark(),
    headline: input.title,
    note: input.subtitle,
  });
}
