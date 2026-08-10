#!/usr/bin/env node
/**
 * photo の公開面を、ローカルスタックで実際に読み書きして確認する。
 *
 * Supabase は anon キーで PostgREST を直接叩ける設計なので、**アプリの API 層は
 * セキュリティ境界ではない**。境界は GRANT と RLS だけ。マイグレーションSQLを
 * 正規表現で照合しても「実際に anon から何が見えるか」は分からないので、
 * ここは本当にロールを切り替えて読み書きする。
 *
 * この検査は 2026-08-10 に実際の破壊を1件見つけている:
 * exif を列権限から外した結果、引数なしの `.select()`（= `select=*`）を使っていた
 * `/api/image-upload` の INSERT ... RETURNING が 42501 で落ち、写真投稿が壊れる状態だった。
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-photo-visibility.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  'anon は非公開訪問の写真行を読めない',
  'anon は公開訪問の写真行を読める（過剰に絞っていない）',
  'anon は exif を読めない（公開写真であっても端末名を見せない）',
  '所有者は自分の非公開写真を読める',
  '他人は非公開写真を読めない',
  'INSERT ... RETURNING id が権限で落ちない',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-photo-visibility: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-photo-visibility: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
