/**
 * 「次に来る人へひとこと」の入力補助。
 *
 * 投稿時のコメントの実データ（2026-09 時点で229件）は、例文が「感想を書こう」だったにも
 * かかわらず大半が「道の駅の入り口にありました」「駐車場は無料」のような現地の案内だった。
 * 読む側に役立つのもそちらなので、入力欄を案内寄りに振り、よく書かれる言い回しを
 * タップで入れられるようにする。書き出しの一語が一番重い。
 */

/** 投稿画面の textarea と PATCH /api/visits/[id] で共有する上限 */
export const VISIT_COMMENT_MAX_LENGTH = 500;

/** タップで入れる候補。実データで繰り返し出てきた言い回しから選んだ */
export const VISIT_TIP_SUGGESTIONS = [
  '駐車場あり',
  '駅から歩ける',
  'ひさしの下にある',
  '建物の入り口にある',
  '見つけにくい',
  '道の駅にある',
] as const;

/**
 * 候補を今の文に足す。既に入っている候補は二重に足さない。
 * 区切りは「。」: 候補同士を並べても、自由文の後ろに足しても文として読める。
 */
export const appendVisitTipSuggestion = (current: string, suggestion: string) => {
  const trimmed = current.trim();
  if (trimmed.includes(suggestion)) return current;
  if (!trimmed) return suggestion;
  const separator = /[。．.!！?？\n]$/.test(trimmed) ? '' : '。';
  return `${trimmed}${separator}${suggestion}`;
};
