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

/** `123456789012` → `1234 5678 9012`。桁が揃わないものはそのまま返す。 */
export function formatFriendCode(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = normalizeFriendCode(value);
  if (normalized.length !== FRIEND_CODE_DIGITS) return value;
  return normalized.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
}
