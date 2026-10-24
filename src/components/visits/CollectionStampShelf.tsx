import { Stamp } from 'lucide-react';

type CollectionStamp = {
  name: string;
  visited: number;
  total: number;
  photoUrl?: string | null;
  href?: string;
};

/** 訪問した蓋を種類・都道府県ごとにまとめた小さなスタンプ。再訪回数ではなく蓋数を表示する。 */
export default function CollectionStampShelf({ title, unit, items }: {
  title: string;
  unit: string;
  items: CollectionStamp[];
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">{title}</h2>
        <span className="text-xs text-[#8C6A4A]">{items.length}{unit}</span>
      </div>
      <p className="mb-3 text-[11px] text-[#6A4D36]">訪問済み / 全マンホール数</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#6A4D36]">まだスタンプがありません</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-x-2 gap-y-3">
          {items.map((item) => {
            const content = (
              <>
                <span className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-dashed p-1 ${item.visited === item.total ? 'border-[#2C765E] bg-[#EDFAF5]' : 'border-[#B5483C]/60 bg-[#FFF8EB]'}`}>
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt="" width={48} height={48} loading="lazy" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <Stamp aria-hidden="true" className="h-6 w-6 text-[#B5483C]/70" />
                  )}
                </span>
                <span className="mt-1 w-full break-words text-center font-pixelJp text-[10px] font-bold leading-relaxed text-[#4F3828]">{item.name}</span>
                <span className="text-[11px] font-bold tabular-nums text-[#6A4D36]">{item.visited}/{item.total}</span>
              </>
            );
            return (
              <li key={item.name} className="min-w-0">
                {item.href ? (
                  <a href={item.href} aria-label={`${item.name}：${item.total}枚中${item.visited}枚訪問済み`} className="flex h-full flex-col items-center rounded-lg p-1 transition hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7B63A8]">{content}</a>
                ) : (
                  <div className="flex h-full flex-col items-center p-1" aria-label={`${item.name}：${item.total}枚中${item.visited}枚訪問済み`}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
