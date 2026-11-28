import type { ReviewTips } from '@/lib/review-tips';
import { reviewTipBasis } from '@/lib/review-tips';

interface Props {
  reviewTips: ReviewTips | null;
}

/**
 * 「口コミから」: 訪れた人のひとことから図鑑が集計した旅情報（駐車場・駅から歩ける…）。
 * 根拠（件数と最新の年月）を必ず添える。状況は変わるので、日付を見て判断してもらう。
 * チップが1つも無い蓋では何も出さない（呼びかけはコメント欄のカードが担う）。
 */
export default function ReviewTipChips({ reviewTips }: Props) {
  if (!reviewTips || reviewTips.tips.length === 0) return null;
  return (
    <div className="rounded-[14px] border border-[#efd9a3] bg-[#fffaf0] px-4 py-3">
      <p className="font-pixelJp text-[12px] font-bold text-[#7d4536]">口コミから</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {reviewTips.tips.map((tip) => (
          <li
            key={tip.key}
            className="inline-flex flex-wrap items-baseline gap-x-1.5 whitespace-nowrap rounded-full border border-[#f0dfb8] bg-white px-2.5 py-1 font-pixelJp text-[12px] font-bold text-[#2c2a26]"
          >
            {tip.label}
            <span className="text-[10px] font-normal text-[#8a7c62]">{reviewTipBasis(tip)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 font-pixelJp text-[10px] leading-relaxed text-[#9b917e]">
        訪れた人のひとことの言葉から自動でまとめています。状況は変わることがあるので、日付を見て判断してください。
      </p>
    </div>
  );
}
