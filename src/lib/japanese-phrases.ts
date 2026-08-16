/**
 * 日本語の文を、折り返してよい境目（句点・読点）で句に割る。
 *
 * 日本語は単語区切りが無いので、放っておくとブラウザは文字単位で折り返す。
 * その結果「〜できま／す。」「〜スタンプ帳／に。」のように意味の途中で切れ、
 * 1〜2文字だけが次行に落ちる。ここで割った句を inline-block にすると、
 * 改行しうる箇所が句の境目だけに限定される（PhraseText がそれを行う）。
 *
 * text-wrap: balance / pretty や word-break: auto-phrase と違い、
 * ブラウザの対応状況に依存しない。
 *
 * 区切り文字は前の句に残す。「。」だけが行頭に来るのを避けるため。
 *
 * 中黒（・）も区切りに含める。「都道府県・登場ポケモン・地図から〜」のような
 * 並列は句点まで20文字以上続くことがあり、句点だけを頼りにすると狭いカラムで
 * 句そのものが1行に入らず、結局その中で文字単位に折り返ってしまう。
 */
const PHRASE_BOUNDARY = /(?<=[。、！？・])/;

export function splitJapanesePhrases(text: string): string[] {
  return text.split(PHRASE_BOUNDARY).filter((phrase) => phrase.length > 0);
}
