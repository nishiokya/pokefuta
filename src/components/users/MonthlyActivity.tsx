/**
 * 公開スタンプ帳の「月ごとの活動」。年（行）× 月（列）のマスで、その月に何回訪問したか（撮影日、日本時間）を
 * 紫の濃さで見せる。数えるのは公開の訪問（再訪も1回ずつ）。マスに重ねると年月と回数が出る（title）。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MONTH_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

// 0回は地の色、1回以上は4段の紫（薄い→濃い）。まだ来ていない月はさらに薄く
const EMPTY = 'bg-[#E8DFC8]';
const FUTURE = 'bg-[#F3EEE4]';
const LEVELS = ['bg-[#D6CCE6]', 'bg-[#C3B5DE]', 'bg-[#A493CC]', 'bg-[#7B63A8]'];

export type ActivityYear = { year: number; months: number[]; total: number };

const toJst = (t: number) => new Date(t + JST_OFFSET_MS);

/** 日時の文字列の並びから、最初の年〜今年の年ごと・月ごとの訪問数を新しい年から返す */
export function buildMonthlyActivity(dates: readonly (string | null)[], now: Date = new Date()): ActivityYear[] {
  const thisYear = toJst(now.getTime()).getUTCFullYear();
  const counts = new Map<number, number[]>();
  for (const value of dates) {
    if (!value) continue;
    const t = Date.parse(value);
    if (Number.isNaN(t)) continue;
    const jst = toJst(t);
    const year = jst.getUTCFullYear();
    if (year > thisYear) continue;
    const months = counts.get(year) ?? Array(12).fill(0);
    months[jst.getUTCMonth()] += 1;
    counts.set(year, months);
  }
  if (counts.size === 0) return [];
  const firstYear = Math.min(...counts.keys());
  const years: ActivityYear[] = [];
  for (let year = thisYear; year >= firstYear; year--) {
    const months = counts.get(year) ?? Array(12).fill(0);
    years.push({ year, months, total: months.reduce((sum, n) => sum + n, 0) });
  }
  return years;
}

const levelClass = (count: number, max: number) =>
  count <= 0 ? EMPTY : LEVELS[Math.min(LEVELS.length - 1, Math.ceil((count / max) * LEVELS.length) - 1)];

export default function MonthlyActivity({
  years,
  truncated = false,
  now = new Date(),
}: {
  years: readonly ActivityYear[];
  truncated?: boolean;
  now?: Date;
}) {
  if (years.length === 0) return null;
  const max = Math.max(1, ...years.flatMap((y) => y.months));
  const jstNow = toJst(now.getTime());
  const thisYear = jstNow.getUTCFullYear();
  const thisMonth = jstNow.getUTCMonth() + 1;

  return (
    <section className="mt-8" aria-labelledby="monthly-activity">
      <div className="rounded-[14px] border border-[#8C6A4A]/20 bg-[#FFFDF7] px-3 py-4 shadow-sm sm:w-fit sm:px-5">
        <h2 id="monthly-activity" className="mb-3 font-pixelJp text-sm font-bold text-[#7B63A8]">月ごとの活動</h2>
        <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))_2.75rem] items-center gap-[3px] sm:grid-cols-[3rem_repeat(12,minmax(0,1.5rem))_3.5rem] sm:gap-1">
          <span aria-hidden="true" />
          {MONTH_NUMBERS.map((m) => (
            <span key={m} className="text-center font-pixel text-[10px] text-[#8C6A4A]" aria-hidden="true">{m}</span>
          ))}
          <span aria-hidden="true" />
          {years.map(({ year, months, total }) => (
            <div key={year} className="contents">
              <span className="font-pixel text-sm font-bold text-[#4F3828]">{year}</span>
              {months.map((count, i) => {
                const future = year === thisYear && i + 1 > thisMonth;
                return (
                  <span
                    key={i}
                    title={future ? undefined : `${year}年${i + 1}月: ${count}回`}
                    className={`aspect-square rounded-[4px] ${future ? FUTURE : levelClass(count, max)}`}
                  >
                    <span className="sr-only">{future ? '' : `${year}年${i + 1}月 ${count}回`}</span>
                  </span>
                );
              })}
              <span className="text-right text-xs text-[#6A4D36]">{total}件</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-[#8C6A4A]">
            撮影日で数えた公開の訪問（同じポケふたへの再訪も1回）。{truncated && '最新500件までで数えています。'}
          </p>
          <span className="flex items-center gap-1 text-[10px] text-[#8C6A4A]" aria-hidden="true">
            少
            {[EMPTY, ...LEVELS].map((c) => (
              <span key={c} className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />
            ))}
            多
          </span>
        </div>
      </div>
    </section>
  );
}
