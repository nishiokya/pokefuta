import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSafeRedirectPath, getSignupReturnPath } from '../src/lib/auth-redirect';

test('新規登録の戻り先は ?redirect= を引き継ぐ', () => {
  assert.equal(getSignupReturnPath('/design-manholes/new'), '/design-manholes/new');
  assert.equal(getSignupReturnPath('/upload?manhole=12'), '/upload?manhole=12');
  assert.equal(
    getSignupReturnPath('https://data.pokefuta.com/manhole/12'),
    'https://data.pokefuta.com/manhole/12',
  );
});

test('戻り先が無いときは従来どおり /upload', () => {
  assert.equal(getSignupReturnPath('/'), '/upload');
  assert.equal(getSignupReturnPath(''), '/upload');
});

test('外部や // 始まりの戻り先は受け付けない', () => {
  assert.equal(getSignupReturnPath('https://evil.example/'), '/upload');
  assert.equal(getSignupReturnPath('//evil.example/'), '/upload');
  assert.equal(getSafeRedirectPath('https://evil.example/'), '/');
  assert.equal(getSafeRedirectPath(null), '/');
});
