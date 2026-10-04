import type { FeedCardTag } from '@/lib/feed-card-tags';

/** フィードのカードに重ねるタグ（幻・伝説・撮れたて…）の色。トップと特集ページで同じ見た目にする */
export const FEED_CHIP_CLASS: Record<FeedCardTag, string> = {
  mythical: 'bg-gradient-to-r from-[#F9A8D4] to-[#C4B5FD] text-[#2E2346]',
  legendary: 'bg-gradient-to-r from-[#FDE68A] to-[#FBBF24] text-[#2E2346]',
  'same-day': 'bg-[#A7F3D0] text-[#064E3B]',
  fresh: 'bg-white text-[#7B63A8]',
  memory: 'bg-[#E7DCC8] text-[#5B4636]',
  pikachu: 'bg-[#FDE047] text-[#422006]',
  regional: 'bg-[#BAE6FD] text-[#0C4A6E]',
  night: 'bg-[#1E1B4B] text-[#E0E7FF] ring-1 ring-white/60',
};
