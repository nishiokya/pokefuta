import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  photoRedirectCachePolicy,
  PUBLIC_PHOTO_CDN_MAX_AGE_SECONDS,
  PHOTO_BROWSER_MAX_AGE_SECONDS,
  PUBLIC_PHOTO_SIGNED_URL_TTL_SECONDS,
} from '../src/lib/photo-redirect-cache';
import { PHOTO_SIGNED_URL_TTL_SECONDS } from '../src/lib/constants';
import { PRIVATE_VISIBILITY_NOTICE } from '../src/lib/visit-visibility';

const R2_PRESIGN_MAX_SECONDS = 7 * 24 * 60 * 60;

test('公開写真は CDN に1日置き、署名URLはそれより長く生かす', () => {
  const policy = photoRedirectCachePolicy(true);
  assert.equal(policy.cacheControl, 'public, max-age=300, s-maxage=86400');
  // CDN に残った 307 をブラウザがさらに使い回しても、転送先が切れていないこと
  assert.ok(
    policy.signedUrlTtlSeconds >= PUBLIC_PHOTO_CDN_MAX_AGE_SECONDS + PHOTO_BROWSER_MAX_AGE_SECONDS + 3600
  );
  assert.ok(policy.signedUrlTtlSeconds <= R2_PRESIGN_MAX_SECONDS);
  assert.doesNotMatch(policy.cacheControl, /stale-while-revalidate/);
});

test('共有キャッシュできない応答は private で短い寿命のまま', () => {
  const policy = photoRedirectCachePolicy(false);
  assert.equal(policy.cacheControl, 'private, max-age=300');
  assert.equal(policy.signedUrlTtlSeconds, PHOTO_SIGNED_URL_TTL_SECONDS);
  assert.doesNotMatch(policy.cacheControl, /public|s-maxage/);
  assert.ok(PHOTO_SIGNED_URL_TTL_SECONDS > PHOTO_BROWSER_MAX_AGE_SECONDS);
});

test('非公開にしたときの案内は、署名URLの寿命（日数）と食い違わない', () => {
  const days = PUBLIC_PHOTO_SIGNED_URL_TTL_SECONDS / (24 * 60 * 60);
  assert.match(PRIVATE_VISIBILITY_NOTICE, new RegExp(`最大${days}日`));
});
