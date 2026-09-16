#!/usr/bin/env node
/**
 * 非公開訪問の一括公開（POST /api/visits/publish-all）を、
 * ローカルスタックで実際にロールを切り替えて確認する。
 *
 * Supabase は anon キーで PostgREST を直接叩ける設計なので、**アプリの API 層は
 * セキュリティ境界ではない**。境界は GRANT と RLS だけ。一括 UPDATE は単体 PATCH と
 * 違って「1文が何行に及ぶか」が問題になるため、他人の記録を巻き込まないことを
 * SQL 側で担保しておく。
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-publish-all-visits.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  '所有者の一括公開は自分の非公開だけを公開にする',
  '他人の非公開は巻き込まれない（RLS が効いている）',
  '既に公開済みの行の updated_at は動かない',
  '他人の user_id を狙って撃っても1行も落ちない',
  '非公開0件のユーザーが実行してもエラーにならず0行',
  '2回目の一括公開は0行（冪等・二度押しで updated_at を焼き直さない）',
  '一括公開後の所有者の公開件数が合う',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-publish-all-visits: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-publish-all-visits: 全項目合格');
for (const check of CHECKS) {
  console.log(`  ✓ ${check}`);
}
