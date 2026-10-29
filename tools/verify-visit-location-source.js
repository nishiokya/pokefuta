#!/usr/bin/env node
/**
 * visit.location_source（撮影位置の有無の印）を、ローカルスタックで実際にロールを切り替えて確認する。
 *
 * visit は本人なら PostgREST で直接書けるので、**アプリの API 層はセキュリティ境界ではない**。
 * 位置情報なしの投稿に必ず印が付くこと・本人が印を書き換えられないこと・公開側から印が
 * 読めないことを SQL 側で担保しておく。
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-visit-location-source.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  '本人の INSERT で、位置ありは gps・位置なしは none になる',
  '本人が location_source を INSERT / UPDATE で書けない（生成列）',
  'anon / authenticated から location_source が読めない',
  '本人が撮影位置を消すと none に変わる',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-visit-location-source: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-visit-location-source: 全項目合格');
for (const check of CHECKS) {
  console.log(`  ✓ ${check}`);
}
