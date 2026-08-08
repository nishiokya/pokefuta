import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL(
  '../supabase/migrations/20260808000000_design_manhole_nearby_review.sql',
  import.meta.url
);
const migration = readFileSync(fileURLToPath(migrationUrl), 'utf8');

test('DB policy: 50m以内の直接INSERTをneeds_reviewへ強制する', () => {
  assert.match(migration, /BEFORE INSERT ON public\.design_manhole/);
  assert.match(
    migration,
    /extensions\.ST_DWithin\(m\.location, submitted_location, 50\)/
  );
  assert.match(migration, /NEW\.status := 'needs_review'/);
});

test('DB policy: needs_reviewを永続化でき、公開status制約に含める', () => {
  assert.match(
    migration,
    /status IN \('published', 'needs_review', 'hidden'\)/
  );
  assert.match(
    migration,
    /status IN \('published', 'needs_review'\)/
  );
  assert.match(migration, /nearby_official_manhole_confirmed_at/);
});
