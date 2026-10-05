import { REGULAR_BADGE_LABEL, type RegularTier } from '@/lib/regular-badges';

/** 投稿者名の横に付ける 👑 常連（金）/ 常連（シルバー）。判定の条件は書かない */
export default function RegularBadge({ tier }: { tier: RegularTier }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none shadow-sm ${
        tier === 'crown'
          ? 'bg-gradient-to-b from-amber-200 to-yellow-400 text-amber-900'
          : 'bg-gradient-to-b from-slate-100 to-slate-300 text-slate-700'
      }`}
    >
      {REGULAR_BADGE_LABEL[tier]}
    </span>
  );
}
