import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChrome } from '../src/lib/siteNav';

test('前方一致でアクティブなタブを決める', () => {
  assert.equal(resolveChrome('/nearby').activeNav, 'search');
  assert.equal(resolveChrome('/manhole/235').activeNav, 'search');
  assert.equal(resolveChrome('/visits').activeNav, 'stamp');
  // 旅の記録（旧マイ旅 /my-trip）もスタンプ帳のタブを光らせる
  assert.equal(resolveChrome('/visits/trip').activeNav, 'stamp');
  assert.equal(resolveChrome('/design-manholes/new').activeNav, 'design');
});

test('表に無いページはどのタブも光らせず、クロムは出す', () => {
  for (const path of ['/', '/upload', '/profile', '/p/abc', '/unknown']) {
    assert.deepEqual(resolveChrome(path), {}, path);
  }
});

test('ログイン画面はクロムを出さない', () => {
  assert.equal(resolveChrome('/login').bare, true);
});

test('SP ヘッダーにページ名を出さない（図鑑と同じ「ポケふた｜写真館」で固定）', () => {
  // ページごとに変わる文字はルート表に持たせない
  for (const path of ['/', '/nearby', '/manhole/235', '/visits', '/login']) {
    assert.equal('title' in resolveChrome(path), false, path);
  }
});
