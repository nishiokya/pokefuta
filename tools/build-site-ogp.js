#!/usr/bin/env node
/**
 * サイト共通の OG 画像（layout と /design-manholes の OGP_IMAGE_URL）を1枚の JPEG に焼く。
 *
 * 公開写真を蓋ごとに1枚ずつ敷き詰め、中央に半透明のカードを置く。1万枚の記念動画
 * （/features/10k-map）の最後のコマと同じ作り。
 *
 * 以前は /opengraph-image が renderOgpFallback で毎回描いていたが、右半分が写真の無い
 * 空の枠になっていた。固定の絵なので静的ファイルにして、実行時には描かない。
 *
 * 再現性のため、使う写真は tools/site-ogp-sources.json に順序ごと固定してある。
 *
 *   node tools/build-site-ogp.js              # マニフェストどおりに焼き直す
 *   node tools/build-site-ogp.js --bootstrap  # 公開データから選び直してマニフェストを更新
 *
 * 投稿者の写真を焼き込むので、写真の削除・非公開はこの画像に自動では反映されない
 * （public/ogp/manhole-photo-mosaic-left-600x630.webp、/features/10k-map の動画も同じ）。
 * 月に1回ほど --bootstrap で、その時点の公開写真から選び直して焼き直す。
 *
 * 出力のファイル名に日付を入れている。中身を変えたら名前を変え、constants.ts の
 * OGP_IMAGE_URL も合わせること（URL が変わらないと SNS が古い画像を配り続ける）。
 *
 * macOS の sharp 同梱 fontconfig は既定の設定を読めず、同梱フォントを使わずに描くことがある。
 * その場合は FONTCONFIG_FILE に public/ogp/fonts を dir に持つ fonts.conf を渡す。
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(__dirname, 'site-ogp-sources.json');
const OUTPUT_PATH = path.join(ROOT, 'public', 'ogp', 'site-card-20261124.jpg');
const FONT_PATH = path.join(ROOT, 'public', 'ogp', 'fonts', 'NotoSansCJKjp-Bold.otf');
const FONT_NAME = 'Noto Sans CJK JP';
const LATEST_PHOTOS_URL = 'https://pokefuta.com/data/latest-manhole-photos.json';
const PHOTO_URL = (photoId) => `https://pokefuta.com/api/photo/${photoId}?size=small`;

const W = 1200;
const H = 630;
const TILE = 80;
const COLS = 15;
const ROWS = 8;
/** 蓋が枠いっぱいに見えるよう、写真の中央を寄せて切る倍率 */
const ZOOM = 1.3;

const CARD_W = 820;
const CARD_H = 340;
const CREAM = '#fdf7e9';
const PURPLE = '#4a3a6b';
const ACCENT = '#c4705e';

/** src/lib/image-sniff.ts と同じ判定。sharp に JPEG / PNG / WebP 以外を渡さない */
function isSupportedImage(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return true;
  }
  return b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function bootstrap() {
  const list = JSON.parse((await fetchBuffer(LATEST_PHOTOS_URL)).toString('utf8'));
  const photos = Object.values(list.photos).map((p) => ({ manhole_id: p.manhole_id, photo_id: p.photo_id }));
  const manifest = { generated_from: LATEST_PHOTOS_URL, count: photos.length, photos };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function loadTile(photoId) {
  const b = await fetchBuffer(PHOTO_URL(photoId));
  if (!isSupportedImage(b)) return null;
  const z = Math.round(TILE * ZOOM);
  const o = Math.round((z - TILE) / 2);
  const big = await sharp(b).rotate().resize(z, z, { fit: 'cover' }).png().toBuffer();
  return sharp(big).extract({ left: o, top: o, width: TILE, height: TILE }).png().toBuffer();
}

const escapePango = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (t, color, size) =>
  `<span foreground="${color}" font_desc="${FONT_NAME} Bold ${size}">${escapePango(t)}</span>`;

async function centredText(markup, top) {
  const input = await sharp({
    text: { text: markup, font: FONT_NAME, fontfile: FONT_PATH, width: CARD_W - 60, align: 'centre', rgba: true },
  })
    .png()
    .toBuffer();
  const { width } = await sharp(input).metadata();
  return { input, left: Math.round((W - width) / 2), top };
}

async function main() {
  const manifest = process.argv.includes('--bootstrap') ? await bootstrap() : JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  const need = COLS * ROWS;
  const tiles = [];
  for (let i = 0; i < manifest.photos.length && tiles.length < need; i += 6) {
    const batch = manifest.photos.slice(i, i + 6);
    const got = await Promise.all(batch.map((p) => loadTile(p.photo_id).catch(() => null)));
    tiles.push(...got.filter(Boolean));
  }
  if (tiles.length < need) throw new Error(`tiles ${tiles.length} < ${need}`);

  const layers = [];
  for (let k = 0; k < need; k++) {
    layers.push({ input: tiles[k], left: (k % COLS) * TILE, top: Math.floor(k / COLS) * TILE - (ROWS * TILE - H) / 2 });
  }

  const cardLeft = (W - CARD_W) / 2;
  const cardTop = (H - CARD_H) / 2;
  layers.push({
    input: Buffer.from(
      `<svg width="${CARD_W}" height="${CARD_H}"><rect width="${CARD_W}" height="${CARD_H}" rx="28" fill="${CREAM}" fill-opacity="0.9"/>` +
        `<rect x="${CARD_W / 2 - 60}" y="196" width="120" height="3" fill="${ACCENT}"/></svg>`
    ),
    left: cardLeft,
    top: cardTop,
  });
  layers.push(
    await centredText(
      `${span('旅先で見つけたポケふたを、', PURPLE, 46)}\n${span('みんなで記録しよう。', PURPLE, 46)}`,
      cardTop + 44
    )
  );
  layers.push(await centredText(span('ポケふた写真館', PURPLE, 32), cardTop + 218));
  layers.push(await centredText(span('pokefuta.com', ACCENT, 32), cardTop + 268));

  await sharp({ create: { width: W, height: H, channels: 3, background: '#2e2340' } })
    .composite(layers)
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(OUTPUT_PATH);
  console.log(`wrote ${path.relative(ROOT, OUTPUT_PATH)} (${fs.statSync(OUTPUT_PATH).size} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
