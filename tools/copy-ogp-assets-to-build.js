const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSET_PATHS = [
  path.join('public', 'ogp', 'fonts', 'NotoSansCJKjp-Bold.otf'),
  path.join('public', 'ogp', 'pokefuta_ogp_template.svg'),
  path.join('public', 'ogp', 'pokefuta_ogp_background_1200x630.png'),
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
