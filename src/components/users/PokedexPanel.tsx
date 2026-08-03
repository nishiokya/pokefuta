import { BookOpen } from 'lucide-react';
import type { PublicPokedex } from '@/lib/user-prefecture-progress';

type PokedexPanelProps = {
  pokedex: PublicPokedex;
};

// 全部並べると数百チップになるので、先頭だけ見せて残りは件数で畳む
const VISIBLE_NAME_LIMIT = 24;

export default function PokedexPanel({ pokedex }: PokedexPanelProps) {
  if (pokedex.collected === 0) return null;

  const visibleNames = pokedex.collectedNames.slice(0, VISIBLE_NAME_LIMIT);
  const hiddenCount = pokedex.collectedNames.length - visibleNames.length;
  // 0種でない限りバーが消えないよう、進捗があるときだけ最小幅を当てる
  const barWidthPercent = pokedex.rate > 0 ? Math.max(pokedex.rate, 1.5) : 0;

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
        <BookOpen className="h-5 w-5 text-[#B5483C]" />
        ポケモン図鑑
      </h2>

      <div className="rounded-[10px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-5 py-5 shadow-sm">
        <div className="flex items-end gap-2">
          <p className="font-pixel text-4xl leading-none text-[#B5483C]">{pokedex.collected}</p>
          <p className="font-pixelJp text-sm font-bold text-[#6A4D36]">
            種類に会いました
            <span className="ml-1 text-[11px] text-[#8C6A4A]">/ 全{pokedex.total}種</span>
          </p>
        </div>

        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#8C6A4A]/20">
          <div
            className="h-full rounded-full bg-[#3F9D7D] transition-all"
            style={{ width: `${barWidthPercent}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {visibleNames.map((name) => (
            <span
              key={name}
              className="rounded-full border border-[#8C6A4A]/20 bg-white/80 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-[#4F3828]"
            >
              {name}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="rounded-full bg-[#8C6A4A]/15 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-[#6A4D36]">
              他{hiddenCount}種
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
