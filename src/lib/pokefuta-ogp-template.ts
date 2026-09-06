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
const BACKGROUND_RELATIVE_PATH = path.join('public', 'ogp', 'pokefuta_ogp_background_1200x630.png');
const OGP_FONT_PATH = resolveOgpAssetPath(OGP_FONT_RELATIVE_PATH);
const TEMPLATE_PATH = resolveOgpAssetPath(TEMPLATE_RELATIVE_PATH);
const BACKGROUND_PATH = resolveOgpAssetPath(BACKGROUND_RELATIVE_PATH);

type PokefutaOgpTemplateInput = {
  photoBuffer: Buffer;
  prefecture: string;
  city: string;
  pokemonNames: string;
  badgeLabel?: string;
};

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

function estimateTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((width, character) => {
    if (/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(character)) {
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
 * ブランド地の上に任意の SVG 要素を重ねた base を作る。
 *
 * 背景 PNG（紙テクスチャ・破線枠・地図・コンパス・下部の緑帯）はポケふた用
 * テンプレートと共有する。デザインマンホールと写真ゼロのカードが素の矩形2枚で
 * 描かれていて、サイト本体ともポケふたカードとも似ていなかったので、
 * 見た目の正本をここ1箇所に寄せる。
 *
 * `inner` には <defs> の中身ではなく、背景の上に載せる要素だけを渡すこと。
 */
async function renderBrandedBase(inner: string): Promise<Buffer> {
  const { backgroundDataUri } = await templateAssetsPromise;
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000000" flood-opacity="0.24"/>
      </filter>
      <clipPath id="photoClip">
        <rect x="54" y="48" width="410" height="410" rx="36"/>
      </clipPath>
    </defs>
    <image href="${backgroundDataUri}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
    ${inner}
  </svg>`;

  if (/@font\x2Dface/.test(svg)) {
    throw new Error('OGP SVG must not depend on a web font at-rule');
  }

  return sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toBuffer();
}

/** ポケふたカードと同じ、白フチ＋影つきの写真枠 */
function photoFrameSvg(photoDataUri: string): string {
  return `<g filter="url(#shadow)">
    <rect x="42" y="36" width="434" height="434" rx="48" fill="#F9F1DC"/>
    <rect x="54" y="48" width="410" height="410" rx="36" fill="#D8D8D8"/>
    <image href="${photoDataUri}" x="54" y="48" width="410" height="410" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>
    <rect x="54" y="48" width="410" height="410" rx="36" fill="none" stroke="#FFFFFF" stroke-width="8"/>
  </g>`;
}

/** 見出しの下に敷く黄色いライン */
const HIGHLIGHT_BAR = '<rect x="520" y="202" width="430" height="18" rx="9" fill="#F2CD45" opacity="0.75"/>';

/**
 * 傾いた緑のリボン（カテゴリ表示）。
 *
 * 文言の長さで帯を伸ばす。sharp の text は width/height を両方指定すると
 * **箱いっぱいに自動スケールする**ので、fontSize ではなく箱の寸法で大きさが決まる。
 * 帯より文字の箱を狭く取らないと、-3度の回転ぶんだけ右端がはみ出す。
 */
function ribbonSvg(width: number): string {
  return `<g transform="translate(535 56) rotate(-3)">
    <rect x="0" y="0" width="${width}" height="50" rx="8" fill="#17614F"/>
    <rect x="8" y="8" width="${width - 16}" height="34" rx="5" fill="none" stroke="#F3E0A8" stroke-width="2" stroke-dasharray="8 5"/>
  </g>`;
}

/** リボン内の文字レイヤの左端と幅。帯より左右 26px ずつ内側に置く */
function ribbonTextBox(width: number): { left: number; width: number } {
  return { left: 535 + 26, width: width - 52 };
}

/** クリーム色の破線チップ */
const CHIP = `<g filter="url(#shadow)">
    <rect x="520" y="304" width="475" height="68" rx="34" fill="#FFF9EA"/>
    <rect x="535" y="316" width="445" height="44" rx="22" fill="none" stroke="#B88950" stroke-width="2" stroke-dasharray="9 5"/>
  </g>`;

/** 右下の pokefuta.com ピル */
const SITE_PILL = `<g filter="url(#shadow)">
    <rect x="900" y="553" width="240" height="50" rx="25" fill="#FFF9EA"/>
    <circle cx="1120" cy="578" r="18" fill="#1C2E28"/>
    <path d="M1115 568 L1115 588 L1130 578 Z" fill="#FFFFFF"/>
  </g>`;

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
      fontSize: 58,
      minFontSize: 46,
      color: '#FFFFFF',
    },
    {
      text: cityTitle,
      left: 520,
      top: textTopFromBaseline(185, 64),
      width: 650,
      height: 90,
      fontSize: 58,
      minFontSize: 46,
      color: '#3A2C22',
    },
    {
      text: truncate(input.pokemonNames, 20),
      left: 528,
      top: textTopFromBaseline(265, 33),
      width: 610,
      height: 54,
      fontSize: 31,
      minFontSize: 24,
      color: '#17614F',
    },
    {
      // チップの内寸は445px。29pxで14文字だと雑学が一番おいしい所で切れるので、
      // 最小フォントを下げて入る文字数を伸ばす
      text: truncate(badgeLabel, 24),
      left: 552,
      top: textTopFromBaseline(348, 29),
      width: 426,
      height: 52,
      fontSize: 29,
      minFontSize: 20,
      color: '#17614F',
    },
    {
      text: '旅先で見つける、全国のポケふたマップ',
      left: 520,
      top: textTopFromBaseline(440, 31),
      width: 640,
      height: 56,
      fontSize: 29,
      minFontSize: 25,
      color: '#2F241C',
    },
    {
      text: '旅行・お出かけのお供に！',
      left: 90,
      top: textTopFromBaseline(585, 24),
      width: 390,
      height: 44,
      fontSize: 20,
      minFontSize: 18,
      color: '#FFFFFF',
    },
    {
      text: 'pokefuta.com',
      left: 916,
      top: textTopFromBaseline(586, 25),
      // ピルは x=900..1140、右端に r=18 の再生ボタンが乗る。224 だと文字が
      // その下に潜り込むので、ボタンの手前で止める
      width: 178,
      height: 44,
      fontSize: 23,
      color: '#17614F',
      align: 'center',
    },
  ]);

  return sharp(base).composite(textLayers).png().toBuffer();
}

// デザインマンホール投稿用OGP。ポケふたカードと同じブランド地・写真枠・リボン・
// チップを使い、右カラムの文言だけを差し替える。
//
// 以前は素の矩形4枚で描いていたため、サイト本体ともポケふたカードとも似ておらず、
// 固定文言「デザインマンホール」が見出し枠で2行に割れ、いちばん目立つ緑の大文字が
// 投稿者名になっていた（2026-09-06 実測）。
export async function renderDesignManholeOgpTemplate(input: {
  photoBuffer: Buffer;
  title: string;
  submitterName?: string | null;
}): Promise<Buffer> {
  const photoBuffer = await sharp(input.photoBuffer)
    .resize(410, 410, { fit: 'cover' })
    .jpeg({ quality: 88 })
    .toBuffer();
  const photoDataUri = imageDataUri(photoBuffer, 'image/jpeg');

  const ribbonWidth = 250;
  const base = await renderBrandedBase(
    `${photoFrameSvg(photoDataUri)}
     ${ribbonSvg(ribbonWidth)}
     ${HIGHLIGHT_BAR}
     ${CHIP}
     ${SITE_PILL}`
  );
  const ribbonBox = ribbonTextBox(ribbonWidth);

  // design_manhole の title は実際には null のことが多い（投稿フォームが必須にしていない）。
  // 見出しを空にすると枠だけ残るので、カテゴリを言い切る文言に落とす。
  // 投稿者名は見出しではなくチップへ置く（被写体より目立たせない）。
  const headline = input.title?.trim() || 'まちのデザインマンホール';
  const submitterLine = input.submitterName
    ? `${truncate(input.submitterName, 12)}さんの投稿`
    : 'みんなの投稿から';

  const textLayers = await buildTextLayers([
    {
      text: 'みんなの投稿',
      left: ribbonBox.left,
      top: 63,
      width: ribbonBox.width,
      height: 38,
      fontSize: 24,
      color: '#FFFFFF',
      align: 'center',
    },
    {
      // 箱いっぱいに自動スケールするので、短い見出しほど大きくなる。
      // 高さ 78 / 幅 590 で頭打ちにして、右の破線枠との間に余白を残す
      text: truncate(headline, 18),
      left: 523,
      top: textTopFromBaseline(190, 62),
      width: 590,
      height: 78,
      fontSize: 52,
      minFontSize: 34,
      color: '#3A2C22',
    },
    {
      text: truncate(submitterLine, 24),
      left: 552,
      top: textTopFromBaseline(348, 29),
      width: 426,
      height: 52,
      fontSize: 29,
      minFontSize: 20,
      color: '#17614F',
    },
    {
      text: 'ご当地のマンホールを、みんなで集める',
      left: 520,
      top: textTopFromBaseline(440, 31),
      width: 600,
      height: 50,
      fontSize: 29,
      minFontSize: 24,
      color: '#2F241C',
    },
    {
      text: 'pokefuta.com',
      left: 916,
      top: textTopFromBaseline(586, 25),
      // ピルは x=900..1140、右端に r=18 の再生ボタンが乗る。224 だと文字が
      // その下に潜り込むので、ボタンの手前で止める
      width: 178,
      height: 44,
      fontSize: 23,
      color: '#17614F',
      align: 'center',
    },
  ]);

  return sharp(base).composite(textLayers).png().toBuffer();
}

/**
 * まだ写真が1枚も投稿されていないポケふたのOGP。
 *
 * ここは以前 renderOgpFallback に落ちていて、タイトルとドメインだけの
 * ほぼ白紙のカードが出ていた（2026-09-06 時点で482枚中22枚が該当し、
 * うち5枚は離島）。シェアしたい蓋ほど白紙になるので、写真枠を
 * 「写真募集中」の枠として見せ、そのまま投稿への誘いにする。
 */
export async function renderPokefutaNoPhotoTemplate(input: {
  prefecture: string;
  city: string;
  pokemonNames: string;
}): Promise<Buffer> {
  const emptyFrame = `<g filter="url(#shadow)">
    <rect x="42" y="36" width="434" height="434" rx="48" fill="#F9F1DC"/>
    <rect x="54" y="48" width="410" height="410" rx="36" fill="#FFF9EA"/>
    <rect x="76" y="70" width="366" height="366" rx="24" fill="none" stroke="#B88950" stroke-width="4" stroke-dasharray="14 10"/>
    <g opacity="0.28" fill="#17614F">
      <rect x="184" y="212" width="150" height="104" rx="18"/>
      <rect x="228" y="196" width="62" height="26" rx="10"/>
      <circle cx="259" cy="264" r="34" fill="#FFF9EA"/>
      <circle cx="259" cy="264" r="20"/>
    </g>
  </g>`;

  const ribbonWidth = 330;
  const base = await renderBrandedBase(
    `${emptyFrame}
     ${ribbonSvg(ribbonWidth)}
     ${HIGHLIGHT_BAR}
     ${CHIP}
     ${SITE_PILL}`
  );
  const ribbonBox = ribbonTextBox(ribbonWidth);

  const textLayers = await buildTextLayers([
    {
      text: 'まだ写真がありません',
      left: ribbonBox.left,
      top: 63,
      width: ribbonBox.width,
      height: 38,
      fontSize: 24,
      color: '#FFFFFF',
      align: 'center',
    },
    {
      text: `${truncate(input.city, 10)}のポケふた`,
      left: 523,
      top: textTopFromBaseline(190, 62),
      width: 590,
      height: 78,
      fontSize: 58,
      minFontSize: 40,
      color: '#3A2C22',
    },
    {
      text: truncate(input.pokemonNames, 20),
      left: 528,
      top: textTopFromBaseline(265, 33),
      width: 585,
      height: 46,
      fontSize: 31,
      minFontSize: 24,
      color: '#17614F',
    },
    {
      text: '最初の1枚を待っています',
      left: 552,
      top: textTopFromBaseline(348, 29),
      width: 426,
      height: 52,
      fontSize: 29,
      minFontSize: 20,
      color: '#17614F',
    },
    {
      text: 'あなたの旅の1枚が、全国の図鑑を完成させます',
      left: 520,
      top: textTopFromBaseline(440, 31),
      width: 600,
      height: 46,
      fontSize: 28,
      minFontSize: 22,
      color: '#2F241C',
    },
    {
      text: 'pokefuta.com',
      left: 916,
      top: textTopFromBaseline(586, 25),
      // ピルは x=900..1140、右端に r=18 の再生ボタンが乗る。224 だと文字が
      // その下に潜り込むので、ボタンの手前で止める
      width: 178,
      height: 44,
      fontSize: 23,
      color: '#17614F',
      align: 'center',
    },
  ]);

  return sharp(base).composite(textLayers).png().toBuffer();
}

/**
 * 最後の受け皿。個別の情報が無いとき（IDが不正・蓋が引けない等）だけここに来る。
 * 素の矩形2枚だと素性の分からない白紙が出るので、こちらもブランド地に乗せる。
 */
export async function renderOgpFallback(input: {
  title: string;
  subtitle: string;
  siteLabel?: string;
}): Promise<Buffer> {
  const base = await renderBrandedBase(
    `<g filter="url(#shadow)">
       <rect x="70" y="228" width="1060" height="210" rx="36" fill="#FFF9EA" fill-opacity="0.94"/>
       <rect x="88" y="246" width="1024" height="174" rx="24" fill="none" stroke="#B88950" stroke-width="2" stroke-dasharray="9 5"/>
     </g>
     ${SITE_PILL}`
  );

  const textLayers = await buildTextLayers([
    {
      text: truncate(input.title, 22),
      left: 120,
      top: textTopFromBaseline(330, 58),
      width: 960,
      height: 86,
      fontSize: 58,
      minFontSize: 40,
      color: '#3A2C22',
    },
    {
      text: truncate(input.subtitle, 32),
      left: 122,
      top: textTopFromBaseline(398, 30),
      width: 960,
      height: 52,
      fontSize: 30,
      minFontSize: 24,
      color: '#17614F',
    },
    {
      text: input.siteLabel ?? 'pokefuta.com',
      left: 916,
      top: textTopFromBaseline(586, 25),
      width: 178,
      height: 44,
      fontSize: 23,
      color: '#17614F',
      align: 'center',
    },
  ]);

  return sharp(base).composite(textLayers).png().toBuffer();
}
