#!/usr/bin/env node
/**
 * `env()` に存在しない safe-area 変数を書いていないか検査する。
 *
 * CSS の `env()` で有効なのは safe-area-inset-{top,right,bottom,left} だけ
 * （と titlebar-area-*）。名前を間違えるとフォールバック無しでは
 * **宣言全体が無効になる**ため、`bottom: calc(env(...) + 5.75rem)` のような
 * 指定が丸ごと効かなくなる。
 *
 * 型チェックもビルドも素通りし、実機でしか気づけない。実際に
 * `safe-area-inset` → `safe-area-body` のクラス名一括置換で env() まで巻き込み、
 * 固定CTAがボトムナビに隠れる不具合を作った（2026-08-08）。
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
// safe-area 系だけを検査する。env() には viewport-segment-* や
// preferred-text-scale など CSSWG が定義するものが他にもあり、許可リスト方式に
// すると将来それらを正しく使ったときに落ちてしまう。
// ここで防ぎたいのは safe-area-* のスペルミスなので、対象をその一族に絞る。
const VALID = new Set([
  'safe-area-inset-top',
  'safe-area-inset-right',
  'safe-area-inset-bottom',
  'safe-area-inset-left',
  'safe-area-max-inset-top',
  'safe-area-max-inset-right',
  'safe-area-max-inset-bottom',
  'safe-area-max-inset-left',
]);

const ENV_CALL = /env\(\s*(safe-area[a-z0-9-]*)/gi;
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.js', '.jsx']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}

const problems = [];
for (const file of walk(path.join(root, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [, name] of text.matchAll(ENV_CALL)) {
    if (!VALID.has(name)) {
      const line = text.slice(0, text.indexOf(`env(${name}`)).split('\n').length;
      problems.push(`${path.relative(root, file)}:${line} env(${name}) は存在しない safe-area 変数`);
    }
  }
}

if (problems.length > 0) {
  console.error('Invalid safe-area env() variables found:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nValid safe-area names: ' + [...VALID].join(', '));
  process.exit(1);
}

console.log('safe-area env() check passed');
