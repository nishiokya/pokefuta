// Supabase クライアントの `.from('<table>') ... .select(...)` を静的に拾う共通処理。
//
// check-photo-select-star.js と check-manhole-comment-user-id.js で共有している。
// どちらも「列単位 GRANT のテーブルに、権限の無い列を要求していないか」を見る検査で、
// 見たいものは同じ（どの列を select しているか）なので、拾う側を1箇所にまとめてある。

const fs = require('fs');
const path = require('path');

/**
 * コメントを空白で潰す（行番号を保つため長さは変えない）。
 *
 * これをやらないと、検査を説明しているコメント本文の `.select()` を自分で拾う。
 * 文字列リテラルの中の `//`（URL 等）をコメントと誤認しないよう、簡易に状態を追う。
 */
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

/** src 配下の .ts / .tsx を集める。 */
function collectSourceFiles(srcRoot) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  })(srcRoot);
  return files;
}

/**
 * `.from('<table>')` から、同じ文（`;` を跨がない・別の `.from(` を跨がない）の中の
 * 最初の `.select(...)` までを拾う。`.insert(...).select(...)` の RETURNING も対象。
 *
 * @returns {{ selectBody: string|null, noArgs: boolean, line: number }[]}
 *          `noArgs` は `.select()`（引数なし＝ select=*）。
 */
function findSelectChains(source, table) {
  const chain = new RegExp(
    `\\.from\\((['"])${table}\\1\\)(?:(?!\\.from\\(|;)[\\s\\S])*?\\.select\\(\\s*(?:(['"\`])([\\s\\S]*?)\\2|(\\)))`,
    'g'
  );
  const found = [];
  let match;
  while ((match = chain.exec(source))) {
    found.push({
      selectBody: match[3] ?? null,
      noArgs: match[4] !== undefined,
      line: source.slice(0, match.index).split('\n').length,
    });
  }
  return found;
}

/** select リストの中で単独のトークンとして現れる `*`（埋め込みや列名の一部は拾わない）。 */
const BARE_STAR = /(^|,)\s*\*\s*(,|$)/;

module.exports = { stripComments, collectSourceFiles, findSelectChains, BARE_STAR };
