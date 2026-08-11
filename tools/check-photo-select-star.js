// photo テーブルを `select=*` で読んでいる箇所が無いことを検査する。
//
// 背景: 20260810120000_restrict_photo_exif_and_private_rows.sql で
// `REVOKE SELECT ON public.photo FROM anon, authenticated` したうえで列を名指しで
// GRANT した（`exif` は意図的に除外）。PostgREST の `select=*` は **photo の全列に
// 展開される**ので、GRANT していない `exif` まで要求して 42501 で落ちる。
// 「権限のある列だけ返す」という挙動にはならない。
//
// この退行は SQL 側の検査（tools/verify-photo-visibility.sql）では捕まらない。
// 列権限と RLS が正しく張れていることと、アプリが権限のある列だけを要求していることは
// 別の話だから。しかも API 層がエラーを汎用文言に丸めるので、本番画面からも見えない
// （2026-08-09 のデザインマンホール投稿全滅と同じ構造）。
//
// 列を足したくなったら、まずマイグレーションの GRANT に足すか判断すること。
// 検査を黙らせるために `*` に戻すのは、塞いだ穴を自分で開け直すのと同じ。

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcRoot = path.join(root, 'src');

const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

walk(srcRoot);

// コメントを空白で潰す（行番号を保つため長さは変えない）。
// これをやらないと、この検査を説明しているコメント本文の `.select()` を自分で拾う。
// 文字列リテラルの中の `//`（URL 等）をコメントと誤認しないよう、簡易に状態を追う。
function stripComments(source) {
  const out = source.split('');
  let i = 0;
  let quote = null; // ' " ` のいずれか
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; i += 1; continue; }
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < source.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

// `.from('photo')` から、同じ文（`;` を跨がない・別の `.from(` を跨がない）の中の
// 最初の `.select(...)` までを見る。`.insert(...).select(...)` の RETURNING も対象。
const CHAIN = /\.from\((['"])photo\1\)(?:(?!\.from\(|;)[\s\S])*?\.select\(\s*(?:(['"`])([\s\S]*?)\2|(\)))/g;

// select リストの中で単独のトークンとして現れる `*`。
// 埋め込み（`visit:visit_id (...)`）や列名の一部は拾わない。
const BARE_STAR = /(^|,)\s*\*\s*(,|$)/;

const violations = [];

for (const file of files) {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  CHAIN.lastIndex = 0;
  let match;
  while ((match = CHAIN.exec(source))) {
    const selectBody = match[3];
    const noArgs = match[4] !== undefined;
    const isStar = noArgs || BARE_STAR.test(selectBody);
    if (!isStar) continue;
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(
      `${path.relative(root, file)}:${line}  ${noArgs ? '.select() （引数なし＝select=*）' : ".select('*')"}`
    );
  }
}

if (violations.length > 0) {
  console.error(
    [
      'photo を select=* で読んでいる箇所がある。',
      'photo は列単位 GRANT で運用しており、`*` は GRANT していない exif まで要求して 42501 で落ちる。',
      '必要な列を明示列挙すること（supabase/migrations/20260810120000_*.sql の GRANT が許可列）。',
      ...violations,
    ].join('\n')
  );
  process.exit(1);
}

console.log('photo select=* check passed');
