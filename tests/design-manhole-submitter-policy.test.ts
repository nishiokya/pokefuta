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

const submitterMigration = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261109090000_design_manhole_submitter_profile.sql', import.meta.url)),
  'utf8'
);

test('投稿者の公開ID: 公開デザイン投稿自体を根拠にし、内部IDは返さない', () => {
  assert.match(submitterMigration, /SELECT au\.id/);
  assert.match(submitterMigration, /JOIN app_user au ON au\.auth_uid = d\.created_by/);
  assert.match(submitterMigration, /d\.id = p_design_manhole_id/);
  assert.match(submitterMigration, /d\.status = 'published'/);
  assert.doesNotMatch(submitterMigration, /public\.get_public_user_ids\(/);
  assert.match(submitterMigration, /RETURNS uuid/);
  assert.match(submitterMigration, /SECURITY DEFINER/);
  assert.match(submitterMigration, /SET search_path TO 'public'/);
  assert.match(submitterMigration, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
  assert.match(submitterMigration, /GRANT EXECUTE ON FUNCTION .* TO anon, authenticated, service_role/);
});

test('デザインマンホールの公開面: 自分の枚数は anon に渡さない', () => {
  assert.match(migration, /get_own_design_manhole_count\(\) TO authenticated, service_role/);
  assert.doesNotMatch(migration, /get_own_design_manhole_count\(\) TO anon/);
});
