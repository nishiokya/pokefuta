import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migration = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261115120000_snow_visit_count.sql', import.meta.url)),
  'utf8'
);

test('雪の訪問数: 公開側は公開訪問だけを数え、1訪問は1回', () => {
  assert.match(migration, /AND v\.is_public = true/);
  assert.match(migration, /EXISTS \(\s*SELECT 1 FROM public\.photo p/);
  assert.match(migration, /ai_tags ->> 'snow' = 'true'/);
  assert.doesNotMatch(migration, /RETURNS TABLE/);
});

test('雪の訪問数: search_path は pg_temp を最後に置き、PUBLIC から外す', () => {
  assert.equal((migration.match(/SET search_path TO public, pg_temp/g) ?? []).length, 2);
  assert.match(migration, /get_public_snow_visit_count\(uuid\) FROM PUBLIC/);
  assert.match(migration, /get_own_snow_visit_count\(\) FROM PUBLIC/);
});

test('雪の訪問数: 自分の枚数は anon の権限を明示的に外す', () => {
  assert.match(migration, /get_own_snow_visit_count\(\) FROM anon/);
  assert.match(migration, /get_own_snow_visit_count\(\) TO authenticated, service_role/);
  assert.doesNotMatch(migration, /get_own_snow_visit_count\(\) TO anon/);
});
