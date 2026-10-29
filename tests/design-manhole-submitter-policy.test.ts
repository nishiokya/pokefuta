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
