/**
 * 投稿ページの「季節の写真、募集中」。いま呼びかける季節を1つだけ持ち、終わりの日を過ぎたら自動で消える
 * （消し忘れて冬に「紅葉募集」が出続けない）。次の季節は、この配列に足すだけ。
 * 判定は日本時間の日付で行う。
 */
export type SeasonalCall = {
  key: string;
  icon: string;
  /** 見出しに入れる季節の名前（例: 紅葉） */
  name: string;
  /** この日（日本時間）の終わりまで出す。YYYY-MM-DD */
  until: string;
};

export const SEASONAL_CALLS: readonly SeasonalCall[] = [
  { key: 'autumn-leaves-2026', icon: '🍁', name: '紅葉', until: '2026-12-10' },
];

const jstDate = (now: Date) => new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** いま出す呼びかけ。無ければ null */
export function activeSeasonalCall(now: Date = new Date(), calls: readonly SeasonalCall[] = SEASONAL_CALLS): SeasonalCall | null {
  const today = jstDate(now);
  return calls.find((call) => today <= call.until) ?? null;
}
