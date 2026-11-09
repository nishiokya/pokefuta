import { before, test } from 'node:test';
import assert from 'node:assert/strict';
// storage/index は読み込み時にストレージのクライアントを作るので、ダミーの向き先を置いてから読む（通信はしない）
process.env.R2_ACCESS_KEY_ID ??= 'test';
process.env.R2_SECRET_ACCESS_KEY ??= 'test';
process.env.R2_ENDPOINT ??= 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
let deriveSmallKey: typeof import('../src/lib/storage/index').deriveSmallKey;
let photoObjectKeys: typeof import('../src/lib/storage/index').photoObjectKeys;
before(async () => {
  ({ deriveSmallKey, photoObjectKeys } = await import('../src/lib/storage/index'));
});

test('訪問写真の原本キーから縮小版のキーを作る', () => {
  assert.equal(
    deriveSmallKey('photos/original/2026/11/00000000-0000-0000-0000-000000000001.jpg'),
    'photos/small/2026/11/00000000-0000-0000-0000-000000000001.webp',
  );
});

test('デザインふた投稿から移した写真は photos/design/small/ の縮小版を引く', () => {
  assert.equal(
    deriveSmallKey('photos/design/original/2026/11/00000000-0000-0000-0000-000000000002.jpg'),
    'photos/design/small/2026/11/00000000-0000-0000-0000-000000000002.webp',
  );
  assert.deepEqual(
    photoObjectKeys('photos/design/original/2026/11/00000000-0000-0000-0000-000000000002.jpg'),
    [
      'photos/design/original/2026/11/00000000-0000-0000-0000-000000000002.jpg',
      'photos/design/small/2026/11/00000000-0000-0000-0000-000000000002.webp',
    ],
  );
});

test('どちらの形でもないキーは null', () => {
  assert.equal(deriveSmallKey('photos/context/original/2026/11/manholes/1/x.jpg'), null);
});
