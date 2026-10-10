import { REGULAR_BADGE_LABEL, type RegularTier } from '@/lib/regular-badges';

/** 投稿者名の横に付ける 👑 MASTER（金）/ EXPLORER（シルバー）/ 🌱 ROOKIE（若葉）。判定の条件は書かない */
const TIER_CLASS: Record<RegularTier, string> = {
  crown: 'bg-gradient-to-b from-amber-200 to-yellow-400 text-amber-900',
  regular: 'bg-gradient-to-b from-slate-100 to-slate-300 text-slate-700',
  rookie: 'bg-gradient-to-b from-lime-100 to-emerald-300 text-emerald-800',
};

const SIZE_CLASS = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-3 py-1 text-xs',
} as const;

export default function RegularBadge({ tier, size = 'sm' }: { tier: RegularTier; size?: keyof typeof SIZE_CLASS }) {
  return (
    <span
      className={`shrink-0 rounded-full ${SIZE_CLASS[size]} font-extrabold leading-none shadow-sm ${TIER_CLASS[tier]}`}
    >
      {REGULAR_BADGE_LABEL[tier]}
    </span>
  );
}
