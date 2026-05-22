const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const FONT_RELATIVE_PATH = path.join('public', 'ogp', 'fonts', 'NotoSansCJKjp-Bold.otf');
const FONT_PATH = path.resolve(ROOT, FONT_RELATIVE_PATH);
const BUILD_FONT_PATH = path.resolve(ROOT, '.next', FONT_RELATIVE_PATH);
const BUILT_ROUTE_PATH = path.join(
  ROOT,
  '.next',
  'server',
  'app',
  'manhole',
  '[id]',
  'opengraph-image',
  'route.js'
);
const SOURCE_TEMPLATE_PATH = path.join(ROOT, 'src', 'lib', 'pokefuta-ogp-template.ts');
const SVG_TEMPLATE_PATH = path.join(ROOT, 'public', 'ogp', 'pokefuta_ogp_template.svg');

function fail(message) {
  console.error(`[verify:ogp-linux] ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`[verify:ogp-linux] ${message}`);
}

function findFiles(startDir, fileName, results = []) {
  if (!fs.existsSync(startDir)) return results;

  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, fileName, results);
    } else if (entry.isFile() && entry.name === fileName) {
      results.push(fullPath);
    }
  }

  return results;
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

async function verifyJapaneseTextPixels() {
  const rendered = await sharp({
    text: {
      text: '<span foreground="#3A2C22" font_desc="Noto Sans CJK JP 64">刈谷市のポケふた</span>',
      font: 'Noto Sans CJK JP',
      fontfile: FONT_PATH,
      width: 760,
      height: 110,
      rgba: true,
    },
  })
    .png()
    .toBuffer();

  const { data, info } = await sharp(rendered)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaquePixels = 0;
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) opaquePixels += 1;
  }

  if (opaquePixels < 1000) {
    fail(`Japanese text appears blank; opaque pixel count was ${opaquePixels}`);
  }

  pass(`Japanese text rendered on Linux via sharp fontfile; opaque pixels=${opaquePixels}`);
}

async function main() {
  if (process.platform !== 'linux') {
    fail(`This check is only valid on Linux. Current platform: ${process.platform}`);
  }

  const buildOutputFonts = findFiles(path.join(ROOT, '.next'), 'NotoSansCJKjp-Bold.otf');
  if (buildOutputFonts.length === 0) {
    fail('NotoSansCJKjp-Bold.otf was not found in .next build output');
  }
  pass(`Font included in build output: ${buildOutputFonts.map((p) => path.relative(ROOT, p)).join(', ')}`);

  if (!fs.existsSync(FONT_PATH)) {
    fail(`Runtime absolute font path does not exist: ${FONT_PATH}`);
  }
  pass(`Runtime absolute font path exists: ${FONT_PATH}`);

  if (!fs.existsSync(BUILD_FONT_PATH)) {
    fail(`Build-output runtime font path does not exist: ${BUILD_FONT_PATH}`);
  }
  pass(`Build-output runtime font path exists: ${BUILD_FONT_PATH}`);

  const sourceTemplate = readRequired(SOURCE_TEMPLATE_PATH);
  if (!sourceTemplate.includes('fontfile: OGP_FONT_PATH')) {
    fail('sharp text overlay is not passing the absolute OGP font path as fontfile');
  }
  if (!sourceTemplate.includes('path.resolve(cwd, relativePath)')) {
    fail('OGP font path is not resolved as an absolute path from process.cwd()');
  }
  pass('sharp text overlay uses an absolute fontfile path');

  const svgTemplate = readRequired(SVG_TEMPLATE_PATH);
  if (svgTemplate.includes('@font-face')) {
    fail('SVG template still contains @font-face');
  }
  pass('SVG template does not contain @font-face');

  const builtRoute = readRequired(BUILT_ROUTE_PATH);
  if (builtRoute.includes('@font-face')) {
    fail('Built OGP route still contains @font-face');
  }
  pass('Built OGP route does not contain @font-face');

  await verifyJapaneseTextPixels();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
