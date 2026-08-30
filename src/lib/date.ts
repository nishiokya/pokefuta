// サーバーコンポーネント用。実行環境のタイムゾーン（本番はUTC）に依らずJSTの日付で表示する
export const formatDateJaJst = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

export const formatDateJa = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP');
};

// ポケふたの写真は日本で撮られている。日付を閲覧者のタイムゾーンで組み立てると、
// 深夜前後の1枚が前日/翌日にずれ、年末年始は年まで変わる。「撮影日」として嘘になるので
// JST に固定する（2026-08-30T04:48Z は LA から見ると 8/29 になっていた）。
const JST_YMD = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const jstYmd = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = JST_YMD.formatToParts(date);
  const pick = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((part) => part.type === type)?.value);
  const ymd = { year: pick('year'), month: pick('month'), day: pick('day') };
  return Object.values(ymd).every(Number.isFinite) ? ymd : null;
};

/** JST の「2026/8/30」。読めない値は空文字。 */
export const formatPhotoDateJst = (value: string) => {
  const ymd = jstYmd(value);
  return ymd ? `${ymd.year}/${ymd.month}/${ymd.day}` : '';
};

/**
 * グリッドのセル用。JST の今年なら年を省いて「8/30」、跨いだら「2024/7/13」。
 * 何年前の1枚かは省いた瞬間に読めなくなるので、そこだけは削らない。
 * 「今年」の判定も JST で行う（年末年始に閲覧者の年で判定すると1年ずれる）。
 */
export const formatPhotoDateJstCompact = (value: string) => {
  const ymd = jstYmd(value);
  if (!ymd) return '';
  const md = `${ymd.month}/${ymd.day}`;
  const currentYear = jstYmd(new Date().toISOString())?.year;
  return ymd.year === currentYear ? md : `${ymd.year}/${md}`;
};
