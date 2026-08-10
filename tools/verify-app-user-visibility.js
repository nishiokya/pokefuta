#!/usr/bin/env node
/**
 * app_user の公開面を、ローカルスタックで実際にロールを切り替えて確認する。
 *
 * Supabase は anon キーで PostgREST を直接叩ける設計なので、**アプリの API 層は
 * セキュリティ境界ではない**。境界は GRANT と RLS だけ。マイグレーションSQLを
 * 正規表現で照合しても「実際に anon から何が見えるか」は分からないので、
 * ここは本当にロールを切り替えて読む。
 *
 * 2026-08-10 まで app_user はテーブル単位の GRANT SELECT と USING (true) の
 * SELECT ポリシー2本を持っており、全ユーザーの全列が anon から読めていた。
 * 列ACL（auth_uid / display_name）は入っていたが、テーブル単位の GRANT に
 * 上書きされて一度も効いていなかった。
 *
 * プロフィールに列を足すときは、まずこの検査に「anon から読めない」ケースを足すこと。
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-app-user-visibility.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  'anon は app_user.auth_uid を読めない',
  'anon は app_user.display_name を読めない',
  'anon は公開ユーザーを get_public_user_info 経由でなら読める（過剰に絞っていない）',
  '公開訪問が無いユーザーは get_public_user_info からも引けない',
  'ログイン済みユーザーは自分の行のバッジ列を読める',
  'ログイン済みユーザーでも bio / SNS URL は直接読めない',
  '他人の app_user 行は読めない',
  'get_own_profile が権限で落ちない',
  'upsert_app_user が権限で落ちない',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-app-user-visibility: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-app-user-visibility: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
