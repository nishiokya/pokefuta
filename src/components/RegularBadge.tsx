import {
  REGULAR_BADGE_ICON,
  REGULAR_BADGE_LABEL,
  REGULAR_BADGE_NAME,
  regularTierDescription,
  type RegularTier,
} from '@/lib/regular-badges';

/** 投稿者名の横に付ける 🏆 LEGEND（虹）/ 👑 MASTER（金）/ ⭐ RANGER（空）/ 🧭 EXPLORER（シルバー）/ 🌱 ROOKIE（若葉）。条件は title に出す */
const TIER_CLASS: Record<RegularTier, string> = {
  legend: 'bg-gradient-to-r from-fuchsia-300 via-amber-200 to-sky-300 text-violet-900 ring-1 ring-violet-400/60',
  crown: 'bg-gradient-to-b from-amber-200 to-yellow-400 text-amber-900',
  ranger: 'bg-gradient-to-b from-sky-100 to-sky-300 text-sky-900',
  regular: 'bg-gradient-to-b from-slate-100 to-slate-300 text-slate-700',
  rookie: 'bg-gradient-to-b from-lime-100 to-emerald-300 text-emerald-800',
};

const SIZE_CLASS = {
  // 写真カードのような狭い場所用。ラベルの代わりにアイコン1つを丸に入れる
  icon: 'inline-flex h-[18px] w-[18px] items-center justify-center text-[11px]',
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-3 py-1 text-xs',
} as const;

export type RegularBadgeSize = keyof typeof SIZE_CLASS;

export default function RegularBadge({ tier, size = 'sm' }: { tier: RegularTier; size?: RegularBadgeSize }) {
  if (size === 'icon') {
    const name = REGULAR_BADGE_NAME[tier];
    const title = `${name}（${regularTierDescription(tier)}）`;
    return (
      <span
        role="img"
        aria-label={name}
        title={title}
        className={`shrink-0 rounded-full ${SIZE_CLASS.icon} leading-none shadow-sm ${TIER_CLASS[tier]}`}
      >
        {REGULAR_BADGE_ICON[tier]}
      </span>
    );
  }

  return (
    <span
      title={regularTierDescription(tier)}
      className={`shrink-0 rounded-full ${SIZE_CLASS[size]} font-extrabold leading-none shadow-sm ${TIER_CLASS[tier]}`}
    >
      {REGULAR_BADGE_LABEL[tier]}
    </span>
  );
}
