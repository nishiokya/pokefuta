import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FRIEND_CODE_DIGITS,
  formatFriendCode,
  hasFriendFieldsInput,
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

test('数字以外が混ざった入力は未設定ではなく無効', () => {
  // 正規化は数字以外を落とすので、`abcd` は空文字になる。それを「未設定」として
  // 通すと、打ち間違いで保存済みのコード・一言・募集状態が黙って消える。
  // 弾かれるほうがまだ良い。
  assert.equal(normalizeFriendCode('abcd'), '');
  assert.ok(!isValidFriendCode('abcd'));
  assert.ok(!isValidFriendCode('1234 5678 90ab'), '一部が文字でも弾く');
  assert.ok(!isValidFriendCode('123456789012!'), '記号が付いていても弾く');
});

test('区切りとして許すのは空白とハイフンだけ', () => {
  assert.ok(isValidFriendCode('1234 5678 9012'));
  assert.ok(isValidFriendCode('1234-5678-9012'));
  assert.ok(isValidFriendCode('1234　5678　9012'), '全角空白');
  assert.ok(isValidFriendCode('１２３４５６７８９０１２'), '全角数字');
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

/**
 * ここから下は「旧クライアントからの PATCH で保存済みの設定が消えないこと」の固定。
 *
 * update_own_public_profile は NULL を「消す」と解釈する（コードを消したら募集も止まる、
 * という意図的な契約で `verify:app-user-visibility` [12] が依存している）。
 * 「送られてこなかった」と「空で送られてきた」を区別できるのは、送信内容が見える
 * この層だけなので、区別を落とすとデプロイ直後にプロフィールを保存した人の
 * トレーナーコードが黙って消える。
 */

// 旧ペイロードの「3列を据え置く」動作そのものは、アプリ側で現在値を読み直すのを
// やめて DB の4引数版へ委ねたので、ここではなく `verify:app-user-visibility` [12b]
// が実測する。この層に残るのは「どちらの版を呼ぶか」の判定だけ。
test('旧4項目だけのペイロードは3項目を指定なしとみなす（4引数版へ回す）', () => {
  assert.ok(!hasFriendFieldsInput({}));
});

test('3項目のどれか1つでもあれば指定ありとみなす', () => {
  // 同じフォームがまとめて送るので、1つあれば残りは「空で送られた」と読んでよい。
  // 空で送られてきたら消す（据え置きにしない）。解除できなくなるため。
  assert.ok(hasFriendFieldsInput({ pokemonGoFriendCode: '' }));
  assert.ok(hasFriendFieldsInput({ pokemonGoFriendNote: '' }));
  assert.ok(hasFriendFieldsInput({ pokemonGoFriendOpen: false }));
});

