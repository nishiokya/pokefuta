import type { BadgeRank } from '@/lib/badge-catalog';

/**
 * バッジのメダル（金・銀・銅）の見た目。ポケモン（PokemonMedal）と都道府県（PrefectureMedal）で共用する。
 * 外周のリングは回った割合、色は段。銅に届くまでは紫のリングで、中身を白黒にする。
 */
export const RANK_LABEL: Record<BadgeRank, string> = { gold: '金', silver: '銀', bronze: '銅' };
export const RANK_ICON: Record<BadgeRank, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };
const RANK_COLOR: Record<BadgeRank, string> = { gold: '#E5B83E', silver: '#9AA6B2', bronze: '#C27A48' };

export const medalRing = (rank: BadgeRank | null, rate: number) =>
  `conic-gradient(${rank ? RANK_COLOR[rank] : '#7B63A8'} ${Math.min(100, Math.max(0, rate))}%, #EADFC8 0)`;

export const medalShadow = (rank: BadgeRank | null) =>
  rank === 'gold' ? 'shadow-[0_0_0_2px_#F5D77A,0_4px_10px_rgba(217,162,27,0.35)]' : 'shadow-sm';

/**
 * 右上の段の印。goldCount が2以上なら、制覇したあとに増えたポケふたまで回ってもう一度そろえた印（🥇×2）。
 * newCount は制覇したあとに増えて、まだ回っていない枚数。
 */
export function RankMark({ rank, goldCount = 1, newCount = 0 }: { rank: BadgeRank | null; goldCount?: number; newCount?: number }) {
  if (!rank) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex items-center gap-0.5" aria-hidden="true">
      <span className="flex h-5 items-center justify-center rounded-full bg-[#FFF3CF] px-0.5 text-[11px] shadow">
        {RANK_ICON[rank]}
        {rank === 'gold' && goldCount > 1 && <span className="font-pixel text-[9px] font-bold text-[#9a6d05]">×{goldCount}</span>}
      </span>
      {newCount > 0 && (
        <span className="rounded-full bg-[#B5483C] px-1 font-pixel text-[9px] font-bold leading-4 text-white">+{newCount}</span>
      )}
    </span>
  );
}

/** 都道府県のメダル。丸の中に短い県名を書く */
export function PrefectureMedal({
  label,
  rank,
  rate,
  size = 52,
  goldCount,
  newCount,
}: {
  label: string;
  rank: BadgeRank | null;
  rate: number;
  size?: number;
  goldCount?: number;
  newCount?: number;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full p-[3px] ${medalShadow(rank)}`}
      style={{ width: size, height: size, background: medalRing(rank, rate) }}
    >
      <span
        className={`flex h-full w-full items-center justify-center rounded-full border-2 border-white text-center font-pixelJp font-extrabold leading-tight ${
          rank ? 'bg-[#FFF8E6] text-[#4F3828]' : 'bg-[#F3EEE4] text-[#8C7F6E]'
        } ${label.length >= 4 ? 'text-[9px]' : 'text-[11px]'}`}
      >
        {label}
      </span>
      <RankMark rank={rank} goldCount={goldCount} newCount={newCount} />
    </span>
  );
}
