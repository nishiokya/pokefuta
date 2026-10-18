/**
 * トップのヒーローに出す「◯月の話題」。公開写真から、その月に起きた意外なことを最大3つ拾う。
 *
 * 蓋ごとの「よく撮られた TOP5」も検討したが、月の写真は百数十枚・撮った人は30人ほどで、
 * 1位でも3人、5位は2人の蓋が30枚並ぶ同点になる（2026-10 の実データ）。順位では差が出ないので、
 * 数ではなく出来事を拾う:
 *
 * - first:    写真館で初めて写真が付いた蓋（例: 壱岐のポケふたに初めての写真）
 * - comeback: 長いあいだ撮られていなかった蓋がまた撮られた（例: 下関で1年2か月ぶり）
 * - busy:     蓋の数のわりに写真が多い県（例: 石川 蓋8枚に写真17枚）
 *
 * 人は出さない（公開リポジトリ・画面とも）。投稿者は「何人が撮ったか」を数えるためだけに使い、
 * 戻り値には入れない。人数の下限を置くのは、1人の大量投稿を「県がにぎわっている」と言わないため。
 */

export type TopicPhoto = {
  manholeId: number;
  /** 撮影日時（無ければ投稿日時）。ISO 文字列 */
  takenAt: string;
  /** 撮った人を数えるためのキー。戻り値には出さない */
  posterKey: string;
};

export type TopicManhole = {
  id: number;
  prefecture: string;
  municipality: string | null;
};

export type MonthlyTopic =
  | { kind: 'first'; place: string; manholeIds: number[]; count: number }
  | { kind: 'comeback'; place: string; manholeIds: number[]; days: number }
  | { kind: 'busy'; prefecture: string; manholeIds: number[]; lids: number; photos: number };

export type MonthlyTopics = { year: number; month: number; topics: MonthlyTopic[] };

/** これより短い間隔は「久しぶり」と呼ばない */
export const COMEBACK_MIN_DAYS = 180;
/** 県がにぎわっていると言うのに要る、その月に撮った人数 */
export const BUSY_MIN_POSTERS = 3;
/** 県がにぎわっていると言うのに要る、蓋1枚あたりの写真数 */
export const BUSY_MIN_PHOTOS_PER_LID = 2;
/** これ未満なら先月の話題に切り替える（月初めは材料が少ない） */
export const MIN_TOPICS = 2;
const MAX_THUMBS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type Ym = { year: number; month: number };

const JST_YM = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric' });

function jstYm(date: Date): Ym | null {
  if (Number.isNaN(date.getTime())) return null;
  const parts = JST_YM.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return Number.isFinite(year) && Number.isFinite(month) ? { year, month } : null;
}

/** JST のその月1日 0:00 */
function monthStart({ year, month }: Ym): number {
  return Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000;
}

function prevYm({ year, month }: Ym): Ym {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function placeOf(m: TopicManhole): string {
  return `${m.prefecture}${m.municipality ?? ''}`;
}

/** 436 → 「1年2か月」、200 → 「6か月」。月は 30.44 日で数える */
export function formatGap(days: number): string {
  const months = Math.floor(days / 30.44);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months}か月`;
  return rest === 0 ? `${years}年` : `${years}年${rest}か月`;
}

function topicsForMonth(photos: TopicPhoto[], manholes: Map<number, TopicManhole>, ym: Ym): MonthlyTopic[] {
  const start = monthStart(ym);
  const end = monthStart(ym.month === 12 ? { year: ym.year + 1, month: 1 } : { year: ym.year, month: ym.month + 1 });

  // 蓋ごとに「その月より前の最後の写真」と「その月の最初の写真」
  const lastBefore = new Map<number, number>();
  const firstIn = new Map<number, number>();
  const monthPhotos: Array<{ manhole: TopicManhole; posterKey: string }> = [];
  for (const p of photos) {
    const t = new Date(p.takenAt).getTime();
    const manhole = manholes.get(p.manholeId);
    if (!Number.isFinite(t) || !manhole || t >= end) continue;
    if (t < start) {
      lastBefore.set(p.manholeId, Math.max(lastBefore.get(p.manholeId) ?? -Infinity, t));
    } else {
      firstIn.set(p.manholeId, Math.min(firstIn.get(p.manholeId) ?? Infinity, t));
      monthPhotos.push({ manhole, posterKey: p.posterKey });
    }
  }

  const topics: MonthlyTopic[] = [];
  const usedPlaces = new Set<string>();

  // first: 初めて写真が付いた蓋を場所ごとにまとめ、枚数の多い場所を1つ
  const firstByPlace = new Map<string, number[]>();
  for (const id of firstIn.keys()) {
    if (lastBefore.has(id)) continue;
    const place = placeOf(manholes.get(id)!);
    firstByPlace.set(place, [...(firstByPlace.get(place) ?? []), id]);
  }
  const first = [...firstByPlace.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  if (first) {
    topics.push({ kind: 'first', place: first[0], manholeIds: first[1].sort((a, b) => a - b), count: first[1].length });
    usedPlaces.add(first[0]);
  }

  // comeback: 間が一番長く空いた場所を1つ。同じ場所でまた撮られた蓋はまとめて見せる
  const comebackByPlace = new Map<string, { days: number; ids: number[] }>();
  for (const [id, t] of firstIn) {
    const before = lastBefore.get(id);
    if (before === undefined) continue;
    const days = Math.floor((t - before) / DAY_MS);
    if (days < COMEBACK_MIN_DAYS) continue;
    const place = placeOf(manholes.get(id)!);
    const cur = comebackByPlace.get(place) ?? { days: 0, ids: [] };
    comebackByPlace.set(place, { days: Math.max(cur.days, days), ids: [...cur.ids, id] });
  }
  const comeback = [...comebackByPlace.entries()]
    .filter(([place]) => !usedPlaces.has(place))
    .sort((a, b) => b[1].days - a[1].days || a[0].localeCompare(b[0]))[0];
  if (comeback) {
    topics.push({ kind: 'comeback', place: comeback[0], manholeIds: comeback[1].ids.sort((a, b) => a - b), days: comeback[1].days });
  }

  // busy: 蓋1枚あたりの写真が一番多い県（人数と比率の下限を満たすものだけ）
  const lidsByPref = new Map<string, number>();
  for (const m of manholes.values()) lidsByPref.set(m.prefecture, (lidsByPref.get(m.prefecture) ?? 0) + 1);
  const byPref = new Map<string, { photos: number; posters: Set<string>; perLid: Map<number, number> }>();
  for (const { manhole, posterKey } of monthPhotos) {
    const cur = byPref.get(manhole.prefecture) ?? { photos: 0, posters: new Set<string>(), perLid: new Map<number, number>() };
    cur.photos += 1;
    cur.posters.add(posterKey);
    cur.perLid.set(manhole.id, (cur.perLid.get(manhole.id) ?? 0) + 1);
    byPref.set(manhole.prefecture, cur);
  }
  const busy = [...byPref.entries()]
    .map(([prefecture, v]) => ({ prefecture, ...v, lids: lidsByPref.get(prefecture) ?? 0 }))
    .filter((v) => v.lids > 0 && v.posters.size >= BUSY_MIN_POSTERS && v.photos >= v.lids * BUSY_MIN_PHOTOS_PER_LID)
    .sort((a, b) => b.photos / b.lids - a.photos / a.lids || b.photos - a.photos)[0];
  if (busy) {
    const manholeIds = [...busy.perLid.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
    topics.push({ kind: 'busy', prefecture: busy.prefecture, manholeIds, lids: busy.lids, photos: busy.photos });
  }

  return topics.map((t) => ({ ...t, manholeIds: t.manholeIds.slice(0, MAX_THUMBS) }));
}

/** 今月（JST）の話題。MIN_TOPICS に届かなければ先月の話題を返す */
export function buildMonthlyTopics(photos: TopicPhoto[], manholeList: TopicManhole[], now: Date): MonthlyTopics | null {
  const ym = jstYm(now);
  if (!ym) return null;
  const manholes = new Map(manholeList.map((m) => [m.id, m]));
  const current = topicsForMonth(photos, manholes, ym);
  if (current.length >= MIN_TOPICS) return { ...ym, topics: current };
  const prev = prevYm(ym);
  const previous = topicsForMonth(photos, manholes, prev);
  return previous.length > 0 ? { ...prev, topics: previous } : null;
}
