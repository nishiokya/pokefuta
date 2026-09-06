#!/usr/bin/env node
/**
 * OGP カード左面に敷く「蓋の壁」モザイクを1枚に焼く。
 *
 * OGP は1リクエストごとに描画されるので、モザイクを都度組むと写真の取得が
 * 枚数ぶん増える。ここで焼いた1枚を実行時は読むだけにして、外部取得は
 * 主役写真の1枚だけに保つ。
 *
 * 再現性のため、使う写真は tools/ogp-mosaic-sources.json に順序ごと固定してある。
 * 並び・クロップ・出力サイズはこのファイルの定数で決まり、実行のたびに変わらない。
 *
 *   node tools/build-ogp-mosaic.js              # マニフェストどおりに焼き直す
 *   node tools/build-ogp-mosaic.js --bootstrap  # 公開データから選び直してマニフェストを更新
 *
 * postbuild からは呼ばない（ネットワークに触るため）。素材を入れ替えたいときだけ手で叩く。
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(__dirname, 'ogp-mosaic-sources.json');
const OUTPUT_PATH = path.join(ROOT, 'public', 'ogp', 'manhole-photo-mosaic-left-600x630.webp');
const LATEST_PHOTOS_URL = 'https://pokefuta.com/data/latest-manhole-photos.json';
const PHOTO_URL = (photoId) => `https://pokefuta.com/api/photo/${photoId}`;

const WIDTH = 600;
const HEIGHT = 630;
/** 隙間から覗く色。紫をかぶせたときに蓋の間の影に見える濃さ */
const GAP_COLOR = '#2E2340';

/**
 * 蓋の配置。等間隔の格子にすると壁紙に見えるので、3種類の大きさを
 * 互い違いに置き、上下左右の端で切れるものを混ぜて「並べた集まり」に見せる。
 * 値は固定。乱数は使わない。
 */
const LIDS = [
  { cx: 38, cy: 54, r: 96 },
  { cx: 214, cy: 26, r: 74 },
  { cx: 380, cy: 70, r: 100 },
  { cx: 566, cy: 34, r: 86 },
  { cx: 96, cy: 220, r: 88 },
  { cx: 272, cy: 200, r: 68 },
  { cx: 442, cy: 244, r: 94 },
  { cx: 596, cy: 208, r: 72 },
  { cx: 20, cy: 386, r: 80 },
  { cx: 196, cy: 366, r: 98 },
  { cx: 376, cy: 404, r: 74 },
  { cx: 546, cy: 384, r: 92 },
  { cx: 88, cy: 546, r: 94 },
  { cx: 272, cy: 576, r: 82 },
  { cx: 456, cy: 562, r: 98 },
  { cx: 606, cy: 540, r: 74 },
];

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function bootstrap() {
  const raw = JSON.parse((await fetchBuffer(LATEST_PHOTOS_URL)).toString('utf8'));
  // manhole_id 昇順で決め打ちする。実行日によって並びが変わらないようにするため
  const rows = Object.values(raw.photos)
    .filter((row) => row && row.photo_id && Number.isFinite(row.manhole_id))
    .sort((a, b) => a.manhole_id - b.manhole_id);

  const picked = [];
  const seen = new Set();
  // 蓋が偏らないよう一定間隔で拾う
  const stride = Math.max(1, Math.floor(rows.length / LIDS.length));
  for (let i = 0; picked.length < LIDS.length && i < rows.length; i += stride) {
    const row = rows[i];
    if (seen.has(row.photo_id)) continue;
    seen.add(row.photo_id);
    picked.push({ manhole_id: row.manhole_id, photo_id: row.photo_id });
  }

  if (picked.length < LIDS.length) {
    throw new Error(`公開写真が足りない: ${picked.length} < ${LIDS.length}`);
  }

  fs.writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify({ generated_from: LATEST_PHOTOS_URL, count: picked.length, photos: picked }, null, 2)}\n`
  );
  console.log(`[mosaic] wrote manifest: ${path.relative(ROOT, MANIFEST_PATH)} (${picked.length} photos)`);
  return picked;
}

async function main() {
  const shouldBootstrap = process.argv.includes('--bootstrap');
  let sources;

  if (shouldBootstrap || !fs.existsSync(MANIFEST_PATH)) {
    sources = await bootstrap();
  } else {
    sources = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).photos;
  }

  const tiles = [];
  for (let i = 0; i < LIDS.length; i += 1) {
    const lid = LIDS[i];
    const source = sources[i % sources.length];
    const size = lid.r * 2;
    const photo = await fetchBuffer(PHOTO_URL(source.photo_id));

    // 円形に切り抜く。紫を上からかぶせるので、ここでは彩度だけ少し落とす
    const circle = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${lid.r}" cy="${lid.r}" r="${lid.r}" fill="#fff"/></svg>`
    );
    const tile = await sharp(photo)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .modulate({ saturation: 0.82 })
      .composite([{ input: circle, blend: 'dest-in' }])
      .png()
      .toBuffer();

    tiles.push({ input: tile, left: Math.round(lid.cx - lid.r), top: Math.round(lid.cy - lid.r) });
    console.log(`[mosaic] tile ${i + 1}/${LIDS.length} manhole=${source.manhole_id}`);
  }

  const base = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: GAP_COLOR },
  })
    .png()
    .toBuffer();

  const out = await sharp(base).composite(tiles).webp({ quality: 72 }).toBuffer();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, out);

  const kb = (out.length / 1024).toFixed(1);
  console.log(`[mosaic] wrote ${path.relative(ROOT, OUTPUT_PATH)} (${WIDTH}x${HEIGHT}, ${kb} KB)`);
  if (out.length > 300 * 1024) {
    console.warn(`[mosaic] 目標の300KBを超えている。quality を下げること`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
