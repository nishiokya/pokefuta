import type { ThemeBadgeProgress } from '@/lib/badge-catalog';

// 貼ったように少しずつ傾ける。色は1枚ずつ変える（並びで決めるので毎回同じ）
const TILTS = ['-rotate-3', 'rotate-2', '-rotate-1', 'rotate-3', '-rotate-2', 'rotate-1'];
const COLORS = [
  'bg-[#FFE3A3] text-[#7A4B00]',
  'bg-[#CDEBD8] text-[#1F6A45]',
  'bg-[#FFD0C2] text-[#8A2E1C]',
  'bg-[#D9D2F2] text-[#4B3A82]',
  'bg-[#CFE6F7] text-[#1F4F7A]',
];

/**
 * ステッカー。スタンプの下に貼ったように並べる。
 * showLocked: まだのものを点線の空き枠で出す（自分のスタンプ帳）。公開スタンプ帳は取ったものだけ
 */
export default function StickerStrip({ stickers, showLocked = false }: {
  stickers: readonly ThemeBadgeProgress[];
  showLocked?: boolean;
}) {
  const shown = showLocked ? stickers : stickers.filter((s) => s.earned);
  if (shown.length === 0) return null;
  const earned = stickers.filter((s) => s.earned).length;
  return (
    <div className="rounded-[12px] border border-[#e9dfc7] bg-[repeating-linear-gradient(135deg,#FFF9EC_0_10px,#FBF1DC_10px_20px)] px-3 pb-4 pt-2.5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-pixelJp text-xs font-bold text-[#4F3828]">ステッカー</h3>
        {showLocked && <span className="font-pixel text-xs text-[#6A4D36]">{earned}/{stickers.length}</span>}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-3">
        {shown.map((sticker, i) => (
          <li
            key={sticker.key}
            title={sticker.description}
            className={
              sticker.earned
                ? `inline-flex items-center gap-1.5 rounded-full border-[3px] border-white px-3 py-1 font-pixelJp text-[11px] font-extrabold shadow-[0_2px_4px_rgba(79,56,40,0.25)] ${TILTS[i % TILTS.length]} ${COLORS[i % COLORS.length]}`
                : 'inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-[#8C6A4A]/25 px-3 py-1 font-pixelJp text-[11px] font-bold text-[#B9A88C]'
            }
          >
            <span aria-hidden="true" className={sticker.earned ? '' : 'opacity-40 grayscale'}>{sticker.icon}</span>
            {sticker.name}
            {!sticker.earned && <span className="sr-only">（まだ）</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
