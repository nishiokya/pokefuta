/**
 * 市町村ごとのひとこと解説。詳細ページの「登場ポケモン」の下に出す。
 *
 * ポケモンの組み合わせや置かれ方に地元の由来があるところだけ手で書く。
 * 例えば指宿は近くにシャワーズやグレイシアが並ぶが、ページだけ見ると
 * 「なぜ近くに別の進化形が？」が分からない。
 *
 * キーは「都道府県＋市区町村」をデータのまま（`city` は「市」を付けない: `鹿児島県指宿`）。
 */

const PLACE_NOTES: Record<string, string> = {
  鹿児島県指宿:
    '指宿市のポケふたは、イーブイと8匹の進化形の全9枚。市名の「いぶすき」を「イーブイ好き」にかけていて、ふたにも「イーブイすき 指宿市」と書かれています。9枚は市内に散らばっていて、近くを歩けば別の進化形に出会えます。',
};

export const placeNote = (manhole: {
  prefecture?: string | null;
  city?: string | null;
  municipality?: string | null;
}): string | null => {
  const city = manhole.city || manhole.municipality;
  if (!manhole.prefecture || !city) return null;
  return PLACE_NOTES[`${manhole.prefecture}${city}`] ?? null;
};
