/**
 * 訪問（visit）に投稿時に添えられた一言の「読む価値」の判定。
 *
 * 本番の実データ（2026-09 時点、1753件中コメントあり229件）を見て決めた:
 * - 数字だけ（"15" "9" …）が41件。連番を入れた人がいて、蓋の情報は何もない
 * - "投稿テスト" のような動作確認
 * - 同じ人が10枚に貼った "ニャンコ" のような4文字以下。地名だけ（"四日市"）もここに入る
 * 一方で5文字以上は「道の駅の入り口にありました」「駐車場は無料」のように、
 * ほぼすべてが次に行く人の役に立つ案内か感想だった。なので長さを主軸にし、
 * 5文字以上でもゴミと言い切れる形（記号だけ・同じ字の連打・テスト）だけを落とす。
 *
 * 判定はクライアントだけで完結させる。コメント本文は既に公開 API で返っているので、
 * ここで隠すのは「目立たせない」であって「読めなくする」ではない（すべての写真から拡大すれば出る）。
 */

export const MIN_MEANINGFUL_COMMENT_LENGTH = 5;

/** 前後の空白を落とし、改行以外の連続空白を1つに畳む。改行は投稿者の区切りなので残す */
export const normalizeVisitComment = (raw: string | null | undefined) =>
  (raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** 空白を除いた文字数。絵文字や結合文字で水増しされないよう code point で数える */
export const visitCommentLength = (text: string) => Array.from(text.replace(/\s+/g, '')).length;

export const isMeaningfulVisitComment = (raw: string | null | undefined) => {
  const text = normalizeVisitComment(raw);
  const compact = text.replace(/\s+/g, '');
  const length = visitCommentLength(text);
  if (length < MIN_MEANINGFUL_COMMENT_LENGTH) return false;
  // 数字・記号・絵文字だけ（"12345" "!!!!!" "😂😂😂😂😂"）
  if (/^[\d\p{P}\p{S}]+$/u.test(compact)) return false;
  // 同じ字の連打（"あああああ" "wwwwww"）。2種類までの字でできていたら中身は無い
  if (new Set(Array.from(compact.toLowerCase())).size <= 2) return false;
  // 動作確認の投稿。長い文の中の「テスト」は本物の話題でありうるので短いものだけ
  if (length <= 10 && /テスト|test/i.test(compact)) return false;
  return true;
};

/** 並べ替え用のスコア。読む価値が無ければ 0、あれば文字数 */
export const visitCommentScore = (raw: string | null | undefined) =>
  isMeaningfulVisitComment(raw) ? visitCommentLength(normalizeVisitComment(raw)) : 0;

type CommentedPhoto = {
  id: string;
  created_at: string;
  visit?: { id?: string | null; comment?: string | null; shot_at?: string | null } | null;
};

export type RankedVisitComment<T> = {
  photo: T;
  /** 呼び出し側の配列での添字。拡大表示を元配列の添字で動かすため持ち回る */
  index: number;
  text: string;
};

/**
 * 「訪れた人のひとこと」に並べる一覧。読む価値のあるものだけを、長い順に並べる。
 *
 * コメントは写真ではなく訪問に付くので、1回の訪問で複数枚上げた人が
 * 同じ文で何度も並ばないよう訪問単位で1件にする（代表は配列で先に来た写真）。
 * 同じ長さなら新しい訪問を先に出す。
 */
export const rankVisitComments = <T extends CommentedPhoto>(photos: T[]): RankedVisitComment<T>[] => {
  const seen = new Set<string>();
  const items: Array<RankedVisitComment<T> & { score: number; time: number }> = [];
  photos.forEach((photo, index) => {
    const key = photo.visit?.id ?? `photo:${photo.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const score = visitCommentScore(photo.visit?.comment);
    if (score === 0) return;
    const time = new Date(photo.visit?.shot_at || photo.created_at).getTime();
    items.push({
      photo,
      index,
      text: normalizeVisitComment(photo.visit?.comment),
      score,
      time: Number.isFinite(time) ? time : 0,
    });
  });
  return items
    .sort((a, b) => b.score - a.score || b.time - a.time || a.index - b.index)
    .map(({ photo, index, text }) => ({ photo, index, text }));
};
