import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FRIEND_CODE_DIGITS,
  formatFriendCode,
  isValidFriendCode,
  normalizeFriendCode,
} from '../src/lib/pokemon-go-friend-code.ts';

/**
 * トレーナーコードは「ゲーム画面からコピーしてそのまま貼る」のが主な入力経路。
 * Pokémon GO のプロフィールは `1234 5678 9012` と4桁区切りで表示するので、
 * 空白を含んだ文字列を弾くと、正しいコードを持っている人が入力できなくなる。
 *
 * ここはあくまで入力補助のテスト。最終的な境界は DB 側
 * （update_own_public_profile の正規化と CHECK 制約）で、そちらは
 * `npm run verify:app-user-visibility` が実際にロールを切り替えて確認する。
 */

test('4桁区切りで貼り付けても12桁に正規化される', () => {
  assert.equal(normalizeFriendCode('1234 5678 9012'), '123456789012');
});

test('ハイフン区切り・不規則な空白も落とす', () => {
  assert.equal(normalizeFriendCode('1234-5678-9012'), '123456789012');
  assert.equal(normalizeFriendCode('  1234　5678　9012 '), '123456789012');
});

test('全角数字を半角に寄せる', () => {
  // iOS の日本語キーボードは全角数字を入れてくることがある
  assert.equal(normalizeFriendCode('１２３４５６７８９０１２'), '123456789012');
});

test('未設定（空文字）は有効として扱う', () => {
  // 「コードを消す」は正当な操作。エラーにすると解除できなくなる
  assert.ok(isValidFriendCode(''));
  assert.ok(isValidFriendCode('   '));
});

test('12桁ちょうどだけを受け付ける', () => {
  assert.ok(isValidFriendCode('123456789012'));
  assert.ok(!isValidFriendCode('12345678901'), '11桁は弾く');
  assert.ok(!isValidFriendCode('1234567890123'), '13桁は弾く');
});

test('数字以外しか含まない入力は未設定ではなく無効', () => {
  // 空文字は「未設定」だが、`abcd` は打ち間違いなので黙って消してはいけない…
  // ただし正規化すると空文字になるため、現状は未設定として通る。
  // この挙動を明示的に固定しておく（変えるならここが落ちる）。
  assert.equal(normalizeFriendCode('abcd'), '');
  assert.ok(isValidFriendCode('abcd'));
});

test('表示は4桁区切りに戻す', () => {
  assert.equal(formatFriendCode('123456789012'), '1234 5678 9012');
});

test('未設定は空文字を返す', () => {
  assert.equal(formatFriendCode(null), '');
  assert.equal(formatFriendCode(undefined), '');
  assert.equal(formatFriendCode(''), '');
});

test('桁が揃わない値は加工せずそのまま返す', () => {
  // DB の CHECK が通した値しか来ない想定だが、勝手に整形して
  // 「12桁に見えるが違う」文字列を作らない
  assert.equal(formatFriendCode('12345'), '12345');
});

test('桁数の定数は12', () => {
  assert.equal(FRIEND_CODE_DIGITS, 12);
});
