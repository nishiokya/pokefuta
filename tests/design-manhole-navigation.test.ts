import assert from 'node:assert/strict';
import test from 'node:test';

import { isSubmissionPage } from '../src/lib/siteNav';

test('投稿画面では下部ナビの投稿FABを隠す', () => {
  assert.equal(isSubmissionPage('/upload'), true);
  assert.equal(isSubmissionPage('/design-manholes/new'), true);
});

test('投稿画面以外では下部ナビの投稿FABを維持する', () => {
  assert.equal(isSubmissionPage('/nearby'), false);
  assert.equal(isSubmissionPage('/visits'), false);
  assert.equal(isSubmissionPage('/design-manholes'), false);
});
