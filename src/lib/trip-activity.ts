/**
 * スタンプ帳「旅の記録」（/visits/trip）の月別一覧と、月ごとの活動（草）で共有する数え方。
 *
 * 同じ蓋を同じ日に何度も記録していても1件に数える（一覧の「N件」と草の濃さを揃えるため）。
 * 月の区切りは閲覧しているブラウザのローカル時刻。一覧の見出しと同じ。
 */

export type TripActivityVisit = {
  manhole_id: number | null;
  manhole?: { id: number } | null;
  shot_at: string;
};

/** shot_at の新しい順に並べ、蓋×日で重複を除く。蓋が無いもの・日付が読めないものは落とす */
export function dedupTripVisits<T extends TripActivityVisit>(visits: T[]): T[] {
  const seen = new Set<string>();
  const sorted = [...visits].sort(
    (a, b) => new Date(b.shot_at).getTime() - new Date(a.shot_at).getTime()
  );
  const result: T[] = [];
  for (const visit of sorted) {
    const manholeId = visit.manhole?.id ?? visit.manhole_id;
    if (!manholeId) continue;
    const d = new Date(visit.shot_at);
    if (isNaN(d.getTime())) continue;
    const key = `${manholeId}-${d.toDateString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(visit);
  }
  return result;
}

/** 月別一覧の見出し（2026年3月）と草のマスを結ぶアンカー */
export const tripMonthAnchor = (year: number, month: number) => `trip-${year}-${month}`;

export type TripActivityYear = {
  year: number;
  /** 1月〜12月の件数（長さ12） */
  months: number[];
  total: number;
};

/** 年ごとに12か月の件数を並べる。新しい年が先頭。記録のない年も間を詰めずに出す */
export function monthlyTripActivity(visits: TripActivityVisit[]): TripActivityYear[] {
  const counts = new Map<number, number[]>();
  for (const visit of dedupTripVisits(visits)) {
    const d = new Date(visit.shot_at);
    const months = counts.get(d.getFullYear()) ?? new Array<number>(12).fill(0);
    months[d.getMonth()] += 1;
    counts.set(d.getFullYear(), months);
  }
  if (counts.size === 0) return [];
  const years = Array.from(counts.keys());
  const newest = Math.max(...years);
  const oldest = Math.min(...years);
  const result: TripActivityYear[] = [];
  for (let year = newest; year >= oldest; year--) {
    const months = counts.get(year) ?? new Array<number>(12).fill(0);
    result.push({ year, months, total: months.reduce((sum, n) => sum + n, 0) });
  }
  return result;
}

/** 草の濃さ。0 = 記録なし、1 = 1〜3件、2 = 4〜9件、3 = 10件以上 */
export function tripActivityLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 9) return 2;
  return 3;
}
