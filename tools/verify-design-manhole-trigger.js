#!/usr/bin/env node
/**
 * design_manhole の近接レビュー強制を、ローカルスタックで実際に INSERT して確認する。
 *
 * `tests/design-manhole-db-policy.test.ts` はマイグレーションSQLを正規表現で照合する
 * だけで、トリガを一度も実行しない。**オブジェクトが存在することと実行時に正しく
 * 動くことは別物**で、2026-08-09 の事故（列が無いまま INSERT が全失敗）はまさに
 * その差で起きた。ここは本当に走らせる。
 *
 * 本番では試せない（投稿を止めている間はアプリの経路が閉じており、検証のためだけに
 * 本番への書き込み手段を作らない方針）。ローカルスタックが同じマイグレーションから
 * 作られていることを前提に、そちらで実行時の挙動を担保する。
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-design-manhole-trigger.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  '50m以内/published → needs_review に書き換わり近接情報が入る',
  '50m圏外/published → published のまま、近接情報は NULL',
  'hidden/authenticated → RLS が拒否する',
  '50m以内/hidden（所有者） → hidden のまま、近接情報は入る',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-design-manhole-trigger: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが起動しているか（`supabase start`）、' +
      'マイグレーションが適用済みか（`supabase migration up --local`）を確認すること。'
  );
  process.exit(1);
}

console.log('verify-design-manhole-trigger: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
