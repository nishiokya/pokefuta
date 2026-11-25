#!/usr/bin/env node
/**
 * 公開スタンプ帳スナップショットの版（DB の変更ログ）を、ローカルスタックで実際に書き込んで確認する。
 * SQL は tools/verify-user-snapshot-rev.sql、二接続の競合は tools/verify-user-snapshot-rev-race.sh。
 * マイグレーション: supabase/migrations/20261125120000_user_snapshot_change_log.sql（PR #501）
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-user-snapshot-rev.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  '変更ログ表は anon / authenticated / service_role から読めず書けない（表・列・シーケンス・RLS）',
  '公開 RPC 2本だけ anon / authenticated が呼べ、合計・失効・トリガ関数は外のロールが呼べない',
  'photo_scorer の自己点検（scoring.audit_photo_scorer）が違反を返さない（ローカルの pg_net は除く）',
  '公開ID が無ければ版も全体も NULL（404 が1本で済む）',
  '全体の版と版 RPC が同じ値、中身に auth_uid が入らない、カードは新しい順',
  '採点（quality_*）・updated_at だけの更新では版が変わらない',
  'ai_tags・訪問の非公開化・フレンド募集 OFF（訪問0件の人も）・デザインマンホールの投稿と非公開化・最後の公開訪問の削除で版が変わり、中身も反映される',
  '関係ない人の版は変わらない、複数の人をまたぐ1文は訪問ごとに1行',
  '訪問の付け替え・主キーを変える写真の移動・公開ID と auth_uid の対応の付け替えで、関係する人の版が変わる',
  '全員の失効（invalidate_all_user_snapshots）',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-user-snapshot-rev: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-user-snapshot-rev: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
console.log('二接続の競合は tools/verify-user-snapshot-rev-race.sh を別に流すこと。');
