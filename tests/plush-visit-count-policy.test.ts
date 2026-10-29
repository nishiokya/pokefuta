import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migration = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261031120000_plush_visit_count.sql', import.meta.url)),
  'utf8'
);

test('ぬいぐるみの訪問数: 公開側は公開訪問だけを数え、1訪問は1回', () => {
  assert.match(migration, /AND v\.is_public = true/);
  assert.match(migration, /EXISTS \(\s*SELECT 1 FROM photo p/);
  assert.match(migration, /ai_tags ->> 'plush' = 'true'/);
  assert.doesNotMatch(migration, /RETURNS TABLE/);
});

test('ぬいぐるみの訪問数: 自分の枚数は anon の権限を明示的に外す', () => {
  assert.match(migration, /get_own_plush_visit_count\(\) FROM anon/);
  assert.match(migration, /get_own_plush_visit_count\(\) TO authenticated, service_role/);
  assert.doesNotMatch(migration, /get_own_plush_visit_count\(\) TO anon/);
});
