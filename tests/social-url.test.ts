import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTAGRAM_SITE, X_SITE, normalizeSocialUrl } from '../src/lib/social-url';

// DB の update_own_public_profile と同じ正規表現。寄せた結果がここを通ることを確かめる。
const DB_X = /^https:\/\/(www\.)?(x\.com|twitter\.com)\/[^/\s]+\/?$/i;
const DB_INSTAGRAM = /^https:\/\/(www\.)?instagram\.com\/[^/\s]+\/?$/i;

test('X: https:// が無い入力やユーザー名だけでも保存できる形に寄せる', () => {
  for (const input of [
    'x.com/pokemonmanhole',
    'www.x.com/pokemonmanhole',
    '@pokemonmanhole',
    'pokemonmanhole',
    'http://x.com/pokemonmanhole',
    'https://x.com/pokemonmanhole',
    ' https://x.com/pokemonmanhole/ ',
    'https://x.com/pokemonmanhole?s=21&t=abc',
    'X.com/pokemonmanhole',
  ]) {
    const out = normalizeSocialUrl(input, X_SITE);
    assert.match(out, DB_X, input);
    assert.match(out, /\/pokemonmanhole$/, input);
  }
  assert.equal(normalizeSocialUrl('twitter.com/foo', X_SITE), 'https://twitter.com/foo');
  assert.equal(normalizeSocialUrl('https://x.com/@foo', X_SITE), 'https://x.com/foo');
});

test('Instagram: 同じく寄せる', () => {
  assert.equal(normalizeSocialUrl('instagram.com/foo.bar', INSTAGRAM_SITE), 'https://instagram.com/foo.bar');
  assert.equal(normalizeSocialUrl('@foo_bar', INSTAGRAM_SITE), 'https://instagram.com/foo_bar');
  const out = normalizeSocialUrl('https://www.instagram.com/foo/?igsh=xyz', INSTAGRAM_SITE);
  assert.equal(out, 'https://www.instagram.com/foo');
  assert.match(out, DB_INSTAGRAM);
});

test('空は空のまま、寄せられないものはそのまま返して検査で落とす', () => {
  assert.equal(normalizeSocialUrl('   ', X_SITE), '');
  for (const input of [
    'https://example.com/foo',
    'https://x.com/foo/status/123',
    'https://x.com/',
    'x.com',
    'javascript:alert(1)',
    'ftp://x.com/foo',
    'foo bar',
  ]) {
    const out = normalizeSocialUrl(input, X_SITE);
    assert.doesNotMatch(out, DB_X, input);
  }
  // Instagram 欄に X の URL を入れても Instagram にはしない
  assert.doesNotMatch(normalizeSocialUrl('x.com/foo', INSTAGRAM_SITE), DB_INSTAGRAM);
});
