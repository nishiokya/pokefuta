#!/usr/bin/env node
/**
 * 都道府県の分母に 47 をハードコードしていないか検査する。
 *
 * ポケふたは47都道府県のうち **42県にしか設置されていない**
 * （群馬・山梨・広島・熊本・大分が0枚）。47を分母にすると誰も100%に到達できず、
 * さらに公開スタンプ帳（totalPrefectureCount = 42 でDB由来）と数字が食い違う。
 * 実際に /visits が `total: 47` を持ち、同じユーザーの同じ実績が
 * 自分のページと公開ページで別の分母で表示されていた（2026-08-09 修正）。
 *
 * 型チェックもビルドも素通りする種類の誤りなので、ここで落とす。
 * 分母が要るときは constants.ts の FALLBACK_INSTALLED_PREFECTURE_COUNT を使い、
 * 正の値は API / DB の実数から取ること。
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// 「都道府県の総数」として47を書いている箇所を拾う。
// 47 という数字そのものは日付や座標にも出るので、分母として使われる形に絞る。
// 47 を定数に逃がしてから分母に使う形（`const T = 47; total = T`）を捕まえる。
// リテラルが同じ行に無いので行単位の走査では拾えない
const CONST_47 = /\b(?:const|let|var)\s+([A-Z_][A-Z0-9_]*|[a-z][A-Za-z0-9_]*)\s*(?::\s*number\s*)?=\s*47\s*;/;

const PATTERNS = [
  // total: 47 / total={47} / totalPrefectures = 47 など
  /\btotal(?:Prefecture(?:Count|s)?)?\s*[:=]\s*\{?\s*47\b/i,
  // "3/47" のような分数表示。文字列内でも JSX テキスト（{activeCount}/47）でも拾う
  /\/47(?![0-9])/,
  // 分母としての除算 activeCount / 47
  /\/\s*47\s*(?:\)|\}|;|$)/,
  // 残り件数の計算 47 - activeCount
  /\b47\s*-\s*[A-Za-z_$]/,
  // 全国制覇の判定 count === 47
  /[=<>]=?\s*47\b/,
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}

// 都道府県の分母を作りうる名前。`PREFECTURES.length` のように47件の配列から
// 数える形はリテラル47が現れないので、名前側で捕まえる
const PREFECTURE_LENGTH = /\bPREFECTURES\s*\.\s*length\b/;

const problems = [];
for (const file of walk(path.join(root, 'src'))) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  // 47 を保持している定数名を先に集める
  const constNames = new Set();
  for (const line of lines) {
    if (/allow-47/.test(line)) continue;
    const match = line.match(CONST_47);
    if (match) constNames.add(match[1]);
  }
  const constUse = constNames.size
    ? new RegExp(`\\btotal(?:Prefecture(?:Count|s)?)?\\s*[:=]\\s*\\{?\\s*(?:${[...constNames].join('|')})\\b`, 'i')
    : null;

  lines.forEach((line, index) => {
    // 「47都道府県のうち42県」のような説明文は落とさない。
    // 意図的に47を使う箇所は `allow-47:` と理由をその行か直前行に書く
    const previous = index > 0 ? lines[index - 1] : '';
    if (/allow-47|42県|42都道府県/.test(line) || /allow-47/.test(previous)) return;
    const hit =
      PATTERNS.some((pattern) => pattern.test(line)) ||
      PREFECTURE_LENGTH.test(line) ||
      (constUse !== null && constUse.test(line));
    if (!hit) return;
    problems.push(`${path.relative(root, file)}:${index + 1} ${line.trim()}`);
  });
}

if (problems.length > 0) {
  console.error('都道府県の分母に 47 がハードコードされています:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    '\nポケふたが設置されているのは42都道府県だけです（群馬・山梨・広島・熊本・大分が0枚）。' +
      '\n分母は API / DB の実数を使い、フォールバックが要るときだけ' +
      ' constants.ts の FALLBACK_INSTALLED_PREFECTURE_COUNT を使ってください。'
  );
  process.exit(1);
}

console.log('prefecture denominator check passed');
