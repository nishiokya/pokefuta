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
const OGP_FONT_PATH = resolveOgpAssetPath(OGP_FONT_RELATIVE_PATH);
const TEMPLATE_PATH = resolveOgpAssetPath(TEMPLATE_RELATIVE_PATH);

/** 暗い地の上に置く文字色。pango は foreground に不透明度を持てないので明度で作る */
const INK = {
  cream: '#F5EEDD',
  muted: '#9FBDB1',
  accent: '#F2CD45',
  footer: '#BFD4CB',
} as const;

/** 円の中心と半径。テンプレート SVG の clipPath と必ず一致させること */
const HERO = { cx: 318, cy: 315, r: 222 } as const;

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

const templatePromise = readFile(TEMPLATE_PATH, 'utf8');

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
  // 配列 join による分割は minifier に定数畳み込みされて literal に戻ることがあるが、
  // 正規表現リテラルは書き換えられないため import 構成が変わっても安定する。
  // エラーメッセージにもトークンを埋め込まないこと。
  if (/@font\x2Dface/.test(svg)) {
    throw new Error('OGP SVG must not depend on a web font at-rule');
  }

  return sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toBuffer();
}

/**
 * カードの中身。左の円に入る SVG（`hero`）と、右カラムの4行。
 *
 * 文字の大きさは `fontSize` ではなく**箱の寸法**で決まる。sharp の text は
 * width と height を両方渡すと箱いっぱいに自動スケールするため、行間や
 * 見出しの大きさを変えたいときは height を動かすこと。
 */
type CardSlots = {
  hero: string;
  /** 小さい前置き。都道府県・カテゴリ */
  eyebrow?: string;
  /** 主役の1行。長ければ2行に折り返る */
  headline: string;
  /** 黄色の1行。登場ポケモン・投稿者 */
  accent?: string;
  /** 補足。雑学・誘い文句 */
  note?: string;
};

async function renderCard(slots: CardSlots): Promise<Buffer> {
  const template = await templatePromise;
  // 前置きが無いカードで罫だけが宙に浮かないよう、罫は eyebrow とセットで出す
  const rule = slots.eyebrow
    ? '<rect x="600" y="150" width="56" height="4" rx="2" fill="#F2CD45"/>'
    : '';
  const base = await renderBaseSvg(template, {
    '{{hero}}': slots.hero,
    '{{rule}}': rule,
  });

  const layers: TextLayerInput[] = [];

  if (slots.eyebrow) {
    layers.push({
      text: truncate(slots.eyebrow, 18),
      left: 600,
      top: textTopFromBaseline(200, 26),
      width: 420,
      height: 26,
      fontSize: 26,
      color: INK.muted,
    });
  }

  layers.push({
    text: truncate(slots.headline, 20),
    left: 598,
    top: textTopFromBaseline(300, 62),
    width: 528,
    height: 84,
    fontSize: 62,
    minFontSize: 38,
    color: INK.cream,
  });

  if (slots.accent) {
    layers.push({
      text: truncate(slots.accent, 22),
      left: 600,
      top: textTopFromBaseline(372, 32),
      width: 528,
      height: 34,
      fontSize: 32,
      minFontSize: 24,
      color: INK.accent,
    });
  }

  if (slots.note) {
    layers.push({
      text: truncate(slots.note, 26),
      left: 600,
      top: textTopFromBaseline(444, 27),
      width: 528,
      height: 28,
      fontSize: 27,
      minFontSize: 21,
      color: INK.muted,
    });
  }

  layers.push({
    text: 'pokefuta.com',
    left: 600,
    top: textTopFromBaseline(552, 25),
    width: 190,
    height: 25,
    fontSize: 25,
    color: INK.footer,
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
 *
 * 同心円と放射のリブで鋳鉄の蓋そのものに見せる。空白を空白のまま出さず、
 * 「ここにあなたの1枚が入る」と読める絵にするのが狙い。
 */
function heroEmptyPlate(): string {
  const ticks = Array.from({ length: 24 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 24;
    const inner = 168;
    const outer = 200;
    const x1 = HERO.cx + Math.cos(angle) * inner;
    const y1 = HERO.cy + Math.sin(angle) * inner;
    const x2 = HERO.cx + Math.cos(angle) * outer;
    const y2 = HERO.cy + Math.sin(angle) * outer;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#F5EEDD" stroke-opacity="0.14" stroke-width="6" stroke-linecap="round"/>`;
  }).join('');

  return `<circle cx="${HERO.cx}" cy="${HERO.cy}" r="${HERO.r}" fill="#153F34"/>
    ${ticks}
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="152" fill="none" stroke="#F5EEDD" stroke-opacity="0.20" stroke-width="2" stroke-dasharray="12 14"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="118" fill="none" stroke="#F5EEDD" stroke-opacity="0.10" stroke-width="2"/>
    <g fill="#F5EEDD" fill-opacity="0.30">
      <rect x="${HERO.cx - 66}" y="${HERO.cy - 28}" width="132" height="94" rx="18"/>
      <rect x="${HERO.cx - 28}" y="${HERO.cy - 44}" width="56" height="24" rx="9"/>
    </g>
    <circle cx="${HERO.cx}" cy="${HERO.cy + 19}" r="31" fill="#153F34"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy + 19}" r="17" fill="#F5EEDD" fill-opacity="0.30"/>`;
}

/** 個別の情報が無いときのマーク。同心円だけ */
function heroMark(): string {
  return `<circle cx="${HERO.cx}" cy="${HERO.cy}" r="${HERO.r}" fill="#153F34"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="170" fill="none" stroke="#F5EEDD" stroke-opacity="0.16" stroke-width="2"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="126" fill="none" stroke="#F5EEDD" stroke-opacity="0.12" stroke-width="2"/>
    <circle cx="${HERO.cx}" cy="${HERO.cy}" r="82" fill="none" stroke="#F2CD45" stroke-opacity="0.55" stroke-width="3"/>`;
}

async function toHeroPhotoUri(photoBuffer: Buffer): Promise<string> {
  const resized = await sharp(photoBuffer)
    .resize(HERO.r * 2, HERO.r * 2, { fit: 'cover' })
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
    eyebrow: input.prefecture,
    headline: `${truncate(input.city, 10)}のポケふた`,
    accent: input.pokemonNames,
    note: input.badgeLabel || '旅先で見つける、全国のポケふたマップ',
  });
}

export async function renderDesignManholeOgpTemplate(input: {
  photoBuffer: Buffer;
  title: string;
  submitterName?: string | null;
}): Promise<Buffer> {
  // design_manhole の title は実際には null のことが多い（投稿フォームが必須にしていない）。
  // 見出しを空にすると版面が崩れるので、カテゴリを言い切る文言に落とす。
  const headline = input.title?.trim() || 'まちのデザインマンホール';

  return renderCard({
    hero: heroPhoto(await toHeroPhotoUri(input.photoBuffer)),
    eyebrow: 'デザインマンホール',
    headline,
    accent: input.submitterName ? `${truncate(input.submitterName, 12)}さんの投稿` : 'みんなの投稿',
    note: 'ご当地のマンホールを、みんなで集める',
  });
}

/**
 * まだ写真が1枚も投稿されていないポケふたのOGP。
 *
 * ここは以前タイトルとドメインだけのほぼ白紙が出ていた（2026-09-06 時点で
 * 482枚中22枚が該当し、うち5枚は離島）。シェアしたい蓋ほど白紙になるので、
 * 空の蓋の絵を主役に据えて、そのまま投稿への誘いにする。
 */
export async function renderPokefutaNoPhotoTemplate(input: {
  prefecture: string;
  city: string;
  pokemonNames: string;
}): Promise<Buffer> {
  return renderCard({
    hero: heroEmptyPlate(),
    eyebrow: input.prefecture,
    headline: `${truncate(input.city, 10)}のポケふた`,
    accent: input.pokemonNames,
    note: 'まだ誰も写真を投稿していません',
  });
}

/** 最後の受け皿。個別の情報が引けないときだけここに来る */
export async function renderOgpFallback(input: {
  title: string;
  subtitle: string;
  siteLabel?: string;
}): Promise<Buffer> {
  return renderCard({
    hero: heroMark(),
    headline: input.title,
    accent: input.subtitle,
  });
}
