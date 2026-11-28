import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migration = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261029120000_design_manhole_public_surface.sql', import.meta.url)),
  'utf8'
);

test('デザインマンホールの公開面: published だけを数え、auth_uid を返さない', () => {
  assert.equal((migration.match(/d\.status = 'published'/g) ?? []).length, 3);
  // どの関数も integer / uuid のスカラーだけを返す（行を返すと auth_uid の列が混ざりうる）
  assert.doesNotMatch(migration, /RETURNS TABLE/);
  assert.doesNotMatch(migration, /SELECT[^;]*d\.created_by[^;]*AS/);
});

test('デザインマンホールの公開面: 投稿者の公開IDは get_public_user_ids に委ねる', () => {
  assert.match(migration, /public\.get_public_user_ids\(ARRAY\[d\.created_by\]\)/);
});

test('デザインマンホールの公開面: 自分の枚数は anon に渡さない', () => {
  assert.match(migration, /get_own_design_manhole_count\(\) TO authenticated, service_role/);
  assert.doesNotMatch(migration, /get_own_design_manhole_count\(\) TO anon/);
});

test('自分のデザインマンホール枚数: anon の実行権限を別のマイグレーションで外す', () => {
  const revoke = readFileSync(
    fileURLToPath(new URL('../supabase/migrations/20261116130000_revoke_anon_own_design_manhole_count.sql', import.meta.url)),
    'utf8'
  );
  assert.match(revoke, /REVOKE ALL ON FUNCTION public\.get_own_design_manhole_count\(\) FROM anon;/);
  assert.doesNotMatch(revoke.replace(/^--.*$/gm, ''), /GRANT/);
});

test('公開スタンプ帳のデザインマンホール一覧: published だけ・created_by などを返さない', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../supabase/migrations/20261128120000_public_design_manholes_by_user.sql', import.meta.url)),
    'utf8'
  );
  const body = sql.replace(/^--.*$/gm, '');
  assert.match(body, /AND d\.status = 'published'/);
  assert.match(body, /SELECT d\.id, d\.title, d\.description, d\.created_at\n/);
  assert.doesNotMatch(body, /RETURNS TABLE \([^)]*(created_by|storage_key|latitude|longitude|exif)/);
  assert.match(body, /SET search_path TO public, pg_temp/);
  assert.match(body, /REVOKE ALL ON FUNCTION public\.get_public_design_manholes\(uuid\) FROM PUBLIC;/);
});
