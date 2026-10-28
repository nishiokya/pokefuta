import { badgeRank, badgeRankThresholds, type BadgeRank } from '@/lib/badge-catalog';
import { RANK_ICON, RANK_LABEL } from '@/components/RankMedal';

/**
 * 公開スタンプ帳の上に並べる数字の欄。集めた割合の輪（円グラフ）で、中に集めた数、その下に全体の数。
 * 輪の色で今どこまで来たかを見せる（称号の色、金・銀・銅の色）。
 */

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/** 下の一言。配列は「金まで」「あと10県」のように、その区切りでだけ折り返す */
export type NotePart = string | readonly string[];

/** 輪の色。2色以上ならグラデーション */
export type RingColors = readonly string[];

// バッジのメダルと同じ色（RankMedal の RANK_COLOR）。銅に届くまでは紫
const RANK_RING: Record<BadgeRank, RingColors> = {
  gold: ['#F5D77A', '#D9A21B'],
  silver: ['#C9D1D9', '#8A96A3'],
  bronze: ['#E0A57A', '#B5683A'],
};
const NO_RANK_RING: RingColors = ['#7B63A8'];
const NEXT_RANK: Record<BadgeRank, BadgeRank | null> = { bronze: 'silver', silver: 'gold', gold: null };

/**
 * 都道府県・ポケモンの欄: 金・銀・銅（バッジと同じ 1/3・2/3・全部）の色と、次の段まであと何か。
 * 輪は「次の段の件数」に対する進み具合（訪問したポケふたと同じ）。全体の数は下の一言に添える。
 * 金に届いたら次が無いので、輪は全体に対して満タンのまま。
 */
export function rankRing(value: number, total: number, unit: string): { total: number; colors: RingColors; note: NotePart[] } {
  const rank = badgeRank(value, total);
  const t = badgeRankThresholds(total);
  const next = rank ? NEXT_RANK[rank] : 'bronze';
  const now = rank ? `${RANK_ICON[rank]}${RANK_LABEL[rank]}` : null;
  const toNext: NotePart = next ? [`${RANK_LABEL[next]}まで`, `あと${Math.max(t[next] - value, 0)}${unit}`] : '制覇！';
  const ofAll: NotePart = `全${total}${unit}中`;
  return {
    total: next ? t[next] : total,
    colors: rank ? RANK_RING[rank] : NO_RANK_RING,
    note: [ofAll, ...(now ? [now] : []), toNext],
  };
}

// label・note は語の区切りで渡す。狭いときはその区切りでだけ折り返す（「ポケふ/た」のように切れないように）
export default function HeroStat({
  id,
  label,
  value,
  total,
  colors = ['#B5483C'],
  note,
}: {
  /** グラデーションの id に使う（1ページに複数置くので重ならないように） */
  id: string;
  label: readonly string[];
  value: number;
  total?: number;
  colors?: RingColors;
  note?: readonly NotePart[];
}) {
  const ratio = total ? Math.min(value / total, 1) : null;
  const gradientId = `hero-ring-${id}`;
  return (
    <div className="flex min-w-0 flex-col items-center rounded-[7px] border border-[#8C6A4A]/15 bg-white/70 px-2 py-3 text-center sm:px-4">
      {/* スマホは2行になる欄があるので、輪の高さがそろうよう2行ぶん取っておく */}
      <p className="min-h-[2.5em] text-[11px] font-extrabold leading-tight text-[#6A4D36] sm:min-h-0">
        {label.map((part) => (
          <span key={part} className="inline-block">{part}</span>
        ))}
      </p>
      {ratio === null ? (
        <p className="my-auto whitespace-nowrap pt-2 font-pixel text-2xl leading-none text-[#B5483C]">{value}</p>
      ) : (
        <div className="relative mt-2 h-[68px] w-[68px] sm:h-[84px] sm:w-[84px]">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
            {colors.length > 1 && (
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                  {colors.map((c, i) => (
                    <stop key={`${c}-${i}`} offset={`${(i / (colors.length - 1)) * 100}%`} stopColor={c} />
                  ))}
                </linearGradient>
              </defs>
            )}
            <circle cx="32" cy="32" r={RING_R} fill="none" stroke="#8C6A4A" strokeOpacity="0.15" strokeWidth="7" />
            {value > 0 && (
              <circle
                cx="32"
                cy="32"
                r={RING_R}
                fill="none"
                stroke={colors.length > 1 ? `url(#${gradientId})` : colors[0]}
                strokeWidth="7"
                strokeLinecap="round"
                // 1つでもあれば点くらいは見えるように
                strokeDasharray={`${Math.max(ratio * RING_C, 2)} ${RING_C}`}
              />
            )}
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center font-pixel leading-none">
            <span className="text-base text-[#4F3828] sm:text-xl">{value}</span>
            <span className="mt-0.5 text-[10px] text-[#8C6A4A] sm:text-xs">/{total}</span>
          </span>
        </div>
      )}
      {note && (
        <p className="mt-1.5 flex flex-wrap justify-center gap-x-1.5 text-[10px] font-bold leading-tight text-[#6A4D36] sm:text-[11px]">
          {note.map((part) => {
            const chunks = typeof part === 'string' ? [part] : part;
            return (
              <span key={chunks.join('')}>
                {chunks.map((chunk) => (
                  <span key={chunk} className="inline-block">{chunk}</span>
                ))}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}
