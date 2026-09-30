#!/usr/bin/env node
/**
 * 周辺風景の列・公開境界・集計をローカル Supabase で実行確認する。
 *
 * 前提: `supabase start` でローカルスタックが動き、migration が適用済みであること。
 * SQL はトランザクション内に fixture を作り、最後にすべてロールバックする。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-photo-landscape.sql');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1];
if (!projectId) {
  console.error('verify-photo-landscape: supabase/config.toml の project_id を取得できません');
  process.exit(1);
}
const CHECKS = [
  'is_landscape は NOT NULL・既定 false で、anon が公開写真の分類を読める',
  '非公開訪問と写真は anon に公開されない',
  '投稿数には風景を含み、写真充足率から風景と非公開写真を除外する',
  '公開訪問カードは蓋写真を優先し、風景だけなら分類を返す',
  'SECURITY DEFINER 関数は PUBLIC から剥奪し、search_path を public, pg_temp に固定する',
];

try {
  execFileSync(
    'docker',
    [
      'exec', '-i', `supabase_db_${projectId}`,
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    ],
    {
      input: fs.readFileSync(SQL_FILE),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-photo-landscape: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
      '\nmigration 未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-photo-landscape: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
