#!/usr/bin/env node
/**
 * photo_scorer（k11 の自動採点ジョブ専用ロール）の権限と scoring 関数の挙動を、
 * ローカルスタックで実際にロールを切り替えて確認する。
 *
 * このロールは本番に直接ログインする。守りたいのは「関数を呼べる」ことより
 * **「それ以外は何もできない」こと**。権限の点検は scoring.audit_photo_scorer() に置き、
 * 本番では k11 のジョブが書き込みの前に毎回呼ぶ（違反があれば書かずに止まる）。
 * ここでは同じ関数が違反を返さないことと、わざと違反を作ったときに検出することを見る。
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
  '権限の自己点検 scoring.audit_photo_scorer() が違反を返さない（ローカルの pg_net は警告）',
  '自己点検が効く: 表の権限・public の REVOKE 忘れ・scoring への追加・メンバーシップ・属性をそれぞれ検出',
  'scoring の所有者と、anon / authenticated からの遮断',
  'photo_scorer 自身が自己点検を呼べ、photo / visit を直接読み書きできない',
  '未採点の一覧に出て、書くと消え、版を上げると再び出る',
  '楽観ロック: 未採点の時点で読んだ古いバッチは上書きしない',
  '楽観ロック: 同じ値を読んでいた別のバッチは、時刻が一致しても上書きしない',
  '不正な入力（範囲・重複・版・型・知らないキー・5001行・2MB超・時刻・uuid）はすべて拒否',
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
