import assert from 'node:assert/strict';
import test from 'node:test';
import { manholePhotoHref, photoIdFromHash } from '../src/lib/manhole-photo-link';

const PHOTO_ID = '3667c188-2682-4169-9311-82fe6239bba8';

test('links carry the clicked photo as a hash, not a query', () => {
  assert.equal(manholePhotoHref(208, PHOTO_ID), `/manhole/208#photo-${PHOTO_ID}`);
  assert.equal(manholePhotoHref(208, null), '/manhole/208');
  assert.equal(manholePhotoHref(208, 'not-a-uuid'), '/manhole/208');
});

test('the detail page reads only well-formed photo hashes', () => {
  assert.equal(photoIdFromHash(`#photo-${PHOTO_ID}`), PHOTO_ID);
  assert.equal(photoIdFromHash(`#photo-${PHOTO_ID.toUpperCase()}`), PHOTO_ID);
  assert.equal(photoIdFromHash('#photo-abc'), null);
  assert.equal(photoIdFromHash('#comments'), null);
  assert.equal(photoIdFromHash(''), null);
});
