/**
 * Pokémon GO のトレーナーコード（フレンドコード）の扱い。
 *
 * 保存は数字12桁、表示は4桁区切り。ゲーム内のプロフィール画面が
 * `1234 5678 9012` と区切って表示するので、利用者はその形でコピーしてくる。
 * 空白やハイフンが混ざったまま弾くと、正しいコードを持っている人が入力できない。
 *
 * ここは入力補助であって境界ではない。最終的な検証は
 * supabase/migrations/20260810140000_app_user_public_surface_and_pokemon_go_friend_code.sql の
 * update_own_public_profile() と CHECK 制約が行う。
 */

export const FRIEND_CODE_DIGITS = 12;
/** Keep in sync with app_user_pokemon_go_friend_note_length. */
export const FRIEND_NOTE_MAX = 50;

/** 全角数字を半角に寄せ、数字以外（空白・ハイフン）を落として12桁の文字列にする。 */
export function normalizeFriendCode(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, '');
}

/** 空文字は「未設定」。未設定か、正規化して12桁ちょうどなら受け付ける。 */
export function isValidFriendCode(value: string): boolean {
  const normalized = normalizeFriendCode(value);
  return normalized === '' || normalized.length === FRIEND_CODE_DIGITS;
}

/** PATCH /api/user/profile が受け取る Pokémon GO の3項目（旧クライアントは送ってこない）。 */
export type FriendFieldsInput = {
  pokemonGoFriendCode?: string;
  pokemonGoFriendNote?: string;
  pokemonGoFriendOpen?: boolean;
};

/** 保存済みの3項目。行がまだ無いユーザーは null。 */
export type FriendFieldsStored = {
  pokemon_go_friend_code: string | null;
  pokemon_go_friend_note: string | null;
  pokemon_go_friend_open: boolean | null;
};

/**
 * 3項目が1つでも送られてきたか。
 *
 * 1つも無いのは、デプロイ前に開かれたプロフィール画面やキャッシュされた PWA が
 * 旧4項目だけを送ってきた場合。そのとき既定値で埋めると保存済みの設定を消すので、
 * 呼び出し側は現在値を読み直す必要がある。3項目は同じフォームが常にまとめて送るため、
 * 「1つでもあれば指定あり」で判定して構わない。
 */
export function hasFriendFieldsInput(input: FriendFieldsInput): boolean {
  return input.pokemonGoFriendCode !== undefined
    || input.pokemonGoFriendNote !== undefined
    || input.pokemonGoFriendOpen !== undefined;
}

/**
 * 送信内容と保存済みの値から、RPC に渡す3項目を決める。
 *
 * `stored` は旧ペイロードのときだけ使う。RPC 側は「NULL = 消す」の契約なので
 * （`verify:app-user-visibility` [12] が依存している）、送られてこなかったことと
 * 空で送られてきたことを区別できるのは送信内容を見えるこの層だけ。
 */
export function resolveFriendFields(
  input: FriendFieldsInput,
  stored: FriendFieldsStored | null
): { code: string; note: string; open: boolean } {
  const provided = hasFriendFieldsInput(input);
  return {
    code: provided ? (input.pokemonGoFriendCode ?? '') : (stored?.pokemon_go_friend_code ?? ''),
    note: provided ? (input.pokemonGoFriendNote ?? '') : (stored?.pokemon_go_friend_note ?? ''),
    open: provided ? Boolean(input.pokemonGoFriendOpen) : (stored?.pokemon_go_friend_open ?? false),
  };
}

/** `123456789012` → `1234 5678 9012`。桁が揃わないものはそのまま返す。 */
export function formatFriendCode(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = normalizeFriendCode(value);
  if (normalized.length !== FRIEND_CODE_DIGITS) return value;
  return normalized.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
}
