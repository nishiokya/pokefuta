import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedAvatarCookieString } from '../src/lib/shared-avatar-cookie';

const uid = '11111111-1111-4111-8111-111111111111';
const photo = '22222222-2222-4222-8222-222222222222';
const prod = { hostname: 'pokefuta.com', protocol: 'https:' };

test('本番では .pokefuta.com に「利用者ID.写真ID」を書く（図鑑と共有）', () => {
  const s = sharedAvatarCookieString(uid, photo, prod);
  assert.match(s, new RegExp(`^pf_avatar=${uid}\\.${photo}; max-age=2592000; `));
  assert.match(s, /domain=\.pokefuta\.com/);
  assert.match(s, /secure/);
});

test('未設定・ログアウトは消す', () => {
  assert.match(sharedAvatarCookieString(uid, null, prod), /^pf_avatar=; max-age=0; .*domain=\.pokefuta\.com/);
  assert.match(sharedAvatarCookieString(null, photo, prod), /^pf_avatar=; max-age=0;/);
});

test('UUID でない値は書かない（クッキーに区切り文字を入れさせない）', () => {
  assert.match(sharedAvatarCookieString(uid, 'x; domain=evil', prod), /^pf_avatar=; max-age=0;/);
});

test('ローカルでは domain を付けない', () => {
  const s = sharedAvatarCookieString(uid, photo, { hostname: 'localhost', protocol: 'http:' });
  assert.doesNotMatch(s, /domain=/);
  assert.doesNotMatch(s, /secure/);
});
