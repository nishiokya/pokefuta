import { monthlyTripActivity, tripActivityLevel, tripMonthAnchor, type TripActivityVisit } from '@/lib/trip-activity';

/**
 * 旅の記録（/visits/trip）の「月ごとの活動」。GitHub の草のように、1年を横1列・12か月のマスで並べる。
 * 濃さは3段（＋記録なし）。マスを押すとその月の一覧へ飛ぶ。
 *
 * 表示だけの部品。訪問一覧はページが1回だけ取ったものを受け取る。
 */

const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

// 旅の記録のアクセント（切り替えの紫）の濃淡
const LEVEL_CLASS = ['bg-[#e9dfc7]', 'bg-[#d6cbe6]', 'bg-[#a893cb]', 'bg-[#7B63A8]'] as const;

export default function TripActivity({ visits, className = '' }: { visits: TripActivityVisit[]; className?: string }) {
  const years = monthlyTripActivity(visits);
  if (years.length === 0) return null;

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  return (
    <section
      aria-label="月ごとの活動"
      className={`rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm ${className}`}
    >
      <p style={{ fontFamily: ROUND, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#7B63A8' }}>
        月ごとの活動
      </p>

      <div className="mt-3 grid grid-cols-[auto_repeat(12,minmax(0,1fr))_auto] items-center gap-x-[3px] gap-y-[5px]">
        <span />
        {Array.from({ length: 12 }, (_, m) => (
          <span key={m} className="text-center font-pixelJp text-[9px] leading-none text-[#8C6A4A]">
            {m + 1}
          </span>
        ))}
        <span />

        {years.map(({ year, months, total }) => (
          <YearRow key={year} year={year} months={months} total={total} thisYear={thisYear} thisMonth={thisMonth} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 font-pixelJp text-[10px] text-[#8C6A4A]">
        <span className="mr-0.5">少</span>
        {LEVEL_CLASS.map((cls) => (
          <span key={cls} className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
        ))}
        <span className="ml-0.5">多</span>
      </div>
    </section>
  );
}

function YearRow({
  year,
  months,
  total,
  thisYear,
  thisMonth,
}: {
  year: number;
  months: number[];
  total: number;
  thisYear: number;
  thisMonth: number;
}) {
  return (
    <>
      <span className="pr-1.5 font-pixelJp text-[11px] font-bold leading-none text-[#4F3828]">{year}</span>
      {months.map((count, m) => {
        const label = `${year}年${m + 1}月 ${count}件`;
        const future = year > thisYear || (year === thisYear && m > thisMonth);
        const cell = `block aspect-square w-full rounded-[4px] ${LEVEL_CLASS[tripActivityLevel(count)]}`;
        // 記録のない月は飛び先の見出しが無いのでリンクにしない。まだ来ていない月は薄くする
        return count > 0 ? (
          <a
            key={m}
            href={`#${tripMonthAnchor(year, m + 1)}`}
            title={label}
            aria-label={label}
            className={`${cell} transition hover:ring-2 hover:ring-[#7B63A8]/40`}
          />
        ) : (
          <span key={m} title={label} aria-hidden="true" className={`${cell} ${future ? 'opacity-40' : ''}`} />
        );
      })}
      <span className="pl-1.5 text-right font-pixelJp text-[10px] leading-none text-[#6A4D36]">{total}件</span>
    </>
  );
}
