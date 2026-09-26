#!/usr/bin/env node
/**
 * photo_scorer（k11 の自動採点ジョブ専用ロール）の権限と scoring 関数の挙動を、
 * ローカルスタックで実際にロールを切り替えて確認する。
 *
 * このロールは本番に直接ログインする。守りたいのは「関数を呼べる」ことより
 * **「それ以外は何もできない」こと**なので、前半で権限を棚卸しする:
 * テーブル・列への直接権限が無いこと、anon より多く呼べる SECURITY DEFINER 関数が
 * scoring の2つだけであること、scoring に足した関数が既定で PUBLIC に開かないこと。
 * 後半は楽観ロックと入力検査（型・範囲・サイズ・知らないキー）。
 *
 * 背景: PR #274 の Codex レビュー。マイグレーションSQLを読むだけでは、PostgreSQL が
 * PUBLIC に与えている既定の権限が見えない。
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-photo-scorer.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  'ロールの属性（superuser / bypassrls / createrole 等なし、接続数 2）と、他ロールのメンバーでないこと',
  'テーブル・ビュー・列への直接権限が1つも無い',
  'anon より多く呼べる SECURITY DEFINER 関数は scoring の2つだけ',
  'scoring の所有者・API ロールからの遮断、REVOKE を忘れた関数を [3] が検出できること',
  'photo / visit を直接読み書きできない',
  '未採点の一覧に出て、書くと消え、版を上げると再び出る',
  '楽観ロック: 未採点の時点で読んだ古いバッチは上書きしない',
  '楽観ロック: 同じ値を読んでいた別のバッチは、時刻が一致しても上書きしない',
  '不正な入力（範囲・重複・版・型・知らないキー・5001行・時刻・uuid）はすべて拒否',
  '書かれた値は1回ぶんだけ',
  'anon / authenticated は scoring の関数を呼べない',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-photo-scorer: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-photo-scorer: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
