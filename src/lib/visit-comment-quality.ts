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
  visit?: { id?: string | null; comment?: string | null; created_at?: string | null } | null;
};

export type VisitCommentEntry<T> = {
  photo: T;
  /** 呼び出し側の配列での添字。拡大表示を元配列の添字で動かすため持ち回る */
  index: number;
  text: string;
  /** ひとことが書かれた日時（訪問の登録日時）。掲示板コメントと同じ軸で並べるために使う */
  postedAt: string;
};

/**
 * 蓋の「コメント」欄に掲示板コメントと混ぜて並べる、写真のひとこと。
 * 読む価値のあるものだけを、書かれた日時の新しい順に返す。
 *
 * 日時は訪問の登録日時（visit.created_at）。撮影日ではない: 掲示板コメントの
 * created_at と同じ「いつ書かれたか」で並べないと、昔の写真を今日上げた人の
 * ひとことが一覧の底に沈む。
 *
 * コメントは写真ではなく訪問に付くので、1回の訪問で複数枚上げた人が
 * 同じ文で何度も並ばないよう訪問単位で1件にする（代表は配列で先に来た写真）。
 */
export const collectVisitComments = <T extends CommentedPhoto>(photos: T[]): VisitCommentEntry<T>[] => {
  const seen = new Set<string>();
  const items: Array<VisitCommentEntry<T> & { time: number }> = [];
  photos.forEach((photo, index) => {
    const key = photo.visit?.id ?? `photo:${photo.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!isMeaningfulVisitComment(photo.visit?.comment)) return;
    const postedAt = photo.visit?.created_at || photo.created_at;
    const time = new Date(postedAt).getTime();
    items.push({
      photo,
      index,
      text: normalizeVisitComment(photo.visit?.comment),
      postedAt,
      time: Number.isFinite(time) ? time : 0,
    });
  });
  return items
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .map(({ photo, index, text, postedAt }) => ({ photo, index, text, postedAt }));
};
