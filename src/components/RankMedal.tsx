import type { BadgeRank } from '@/lib/badge-catalog';

/**
 * バッジのメダル（金・銀・銅）の見た目。ポケモン（PokemonMedal）と都道府県（PrefectureMedal）で共用する。
 * 外周のリングは回った割合、色は段。銅に届くまでは紫のリングで、中身を白黒にする。
 * 金 > 銀 > 銅 がひと目で分かるよう、都道府県は丸の中を段の色で塗る（金は濃い金に白抜きの字、銀は銀、銅は薄い銅）。
 * 右上の印も金だけ大きくする。
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
    <span className={`absolute flex items-center gap-0.5 ${rank === 'gold' ? '-right-2 -top-2' : '-right-1 -top-1'}`} aria-hidden="true">
      <span
        className={
          rank === 'gold'
            ? 'flex h-6 items-center justify-center rounded-full bg-gradient-to-b from-[#FFF3CF] to-[#FFE08A] px-0.5 text-sm shadow-[0_0_0_1.5px_#E5B83E,0_2px_4px_rgba(160,110,0,0.4)]'
            : 'flex h-4 items-center justify-center rounded-full bg-white/90 px-px text-[9px] shadow-sm'
        }
      >
        {RANK_ICON[rank]}
        {rank === 'gold' && goldCount > 1 && <span className="pr-0.5 font-pixel text-[10px] font-bold text-[#9a6d05]">×{goldCount}</span>}
      </span>
      {newCount > 0 && (
        <span className="rounded-full bg-[#B5483C] px-1 font-pixel text-[9px] font-bold leading-4 text-white">+{newCount}</span>
      )}
    </span>
  );
}

// 丸の中の塗り。金は白抜きの字で一番強く、銀は金属の銀、銅は薄く
const PREFECTURE_FILL: Record<BadgeRank | 'none', string> = {
  gold: 'bg-[linear-gradient(135deg,#FBE08A_0%,#E5B83E_50%,#C38A12_100%)] text-white [text-shadow:0_1px_1px_rgba(110,70,0,0.55)]',
  silver: 'bg-[linear-gradient(135deg,#F7F9FA_0%,#C9D0D7_100%)] text-[#3F4A55]',
  bronze: 'bg-[#F8E8DA] text-[#7A4524]',
  none: 'bg-[#F3EEE4] text-[#8C7F6E]',
};

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
          PREFECTURE_FILL[rank ?? 'none']
        } ${label.length >= 4 ? 'text-[9px]' : 'text-[11px]'}`}
      >
        {label}
      </span>
      <RankMark rank={rank} goldCount={goldCount} newCount={newCount} />
    </span>
  );
}
