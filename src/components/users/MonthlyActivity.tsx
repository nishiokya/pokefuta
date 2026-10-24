/**
 * 公開スタンプ帳の「月ごとの活動」。直近12か月に何枚訪問したか（撮影日、日本時間）を棒で見せる。
 * 数えるのは公開の訪問（再訪も1回ずつ）。棒に重ねると月と枚数が出る（title）。
 */

const MONTHS = 12;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type MonthBucket = { key: string; label: string; year: number; month: number; count: number };

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/** 日時の文字列の並びから、now を含む直近12か月の訪問数を古い順に返す */
export function buildMonthlyActivity(dates: readonly (string | null)[], now: Date = new Date()): MonthBucket[] {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const buckets: MonthBucket[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    buckets.push({ key: monthKey(year, month), label: `${month}月`, year, month, count: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const value of dates) {
    if (!value) continue;
    const t = Date.parse(value);
    if (Number.isNaN(t)) continue;
    const jst = new Date(t + JST_OFFSET_MS);
    const bucket = byKey.get(monthKey(jst.getUTCFullYear(), jst.getUTCMonth() + 1));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export default function MonthlyActivity({ buckets, truncated = false }: { buckets: readonly MonthBucket[]; truncated?: boolean }) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return null;
  const max = Math.max(...buckets.map((b) => b.count));
  const activeMonths = buckets.filter((b) => b.count > 0).length;

  return (
    <section className="mt-8" aria-labelledby="monthly-activity">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="monthly-activity" className="text-lg font-extrabold text-[#4F3828]">月ごとの活動</h2>
        <p className="text-xs font-bold text-[#6A4D36]">直近12か月で{total}回・{activeMonths}か月</p>
      </div>
      <div className="rounded-[10px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-3 pb-2 pt-4 shadow-sm sm:px-5">
        <ol className="flex h-28 items-end gap-[2px] border-b border-[#8C6A4A]/25 sm:gap-1">
          {buckets.map((b) => (
            <li
              key={b.key}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
              title={`${b.year}年${b.month}月: ${b.count}回`}
            >
              {b.count > 0 && (
                <>
                  {/* いちばん多い月だけ数字を出す。ほかは重ねると出る */}
                  <span
                    className={`absolute font-pixel text-[10px] font-bold text-[#4F3828] ${b.count === max ? '' : 'hidden group-hover:block'}`}
                    style={{ bottom: `calc(${(b.count / max) * 100}% + 2px)` }}
                  >
                    {b.count}
                  </span>
                  <span
                    className="w-full max-w-[22px] rounded-t-[4px] bg-[#B5483C] transition group-hover:bg-[#8F3328]"
                    style={{ height: `${Math.max((b.count / max) * 85, 3)}%` }}
                  />
                </>
              )}
              <span className="sr-only">{`${b.year}年${b.month}月 ${b.count}回`}</span>
            </li>
          ))}
        </ol>
        <ol className="mt-1 flex gap-[2px] sm:gap-1" aria-hidden="true">
          {buckets.map((b, i) => (
            <li key={b.key} className="min-w-0 flex-1 text-center font-pixel text-[9px] text-[#6A4D36] sm:text-[10px]">
              {/* スマホは1か月おき（いちばん右の今月は必ず出す） */}
              <span className={i % 2 === (MONTHS - 1) % 2 ? '' : 'max-sm:invisible'}>{b.label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-[#6A4D36]">
          撮影日で数えた公開の訪問（同じポケふたに何度行っても1回ずつ）。
          {truncated && '最新500件までで数えています。'}
        </p>
      </div>
    </section>
  );
}
