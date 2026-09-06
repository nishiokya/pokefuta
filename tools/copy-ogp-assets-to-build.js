const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSET_PATHS = [
  path.join('public', 'ogp', 'fonts', 'NotoSansCJKjp-Bold.otf'),
  path.join('public', 'ogp', 'pokefuta_ogp_template.svg'),
  // 左面に敷く焼き込み済みモザイク。実行時に写真を集め直さないための固定アセット
  path.join('public', 'ogp', 'manhole-photo-mosaic-left-600x630.webp'),
];

for (const relativePath of ASSET_PATHS) {
  const source = path.join(ROOT, relativePath);
  const destination = path.join(ROOT, '.next', relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing OGP asset: ${source}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  console.log(`[postbuild] Copied ${relativePath} to .next build output`);
}
