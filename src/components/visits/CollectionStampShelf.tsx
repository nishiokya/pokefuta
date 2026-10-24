'use client';

import { useState } from 'react';
import { Stamp } from 'lucide-react';

type CollectionStamp = {
  name: string;
  visited: number;
  total: number;
  photoUrl?: string | null;
  href?: string;
};

// 「アローラキュウコン」のような長い名前が途中で折れないよう、字数で文字を小さくして1行に収める
const nameSizeClass = (name: string) => {
  if (name.length >= 8) return 'text-[8px] tracking-[-0.04em]';
  if (name.length === 7) return 'text-[9px] tracking-[-0.02em]';
  return 'text-[10px]';
};

/** 訪問した蓋を種類・都道府県ごとにまとめた小さなスタンプ。再訪回数ではなく蓋数を表示する。 */
export default function CollectionStampShelf({ title, unit, items, initialCount }: {
  title: string;
  unit: string;
  items: CollectionStamp[];
  /** 指定すると最初はこの数だけ出し、残りは「すべて見る」で開く（ポケモンは100種を超えて下の段を押し出すため） */
  initialCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = initialCount !== undefined && items.length > initialCount;
  const shown = collapsible && !expanded ? items.slice(0, initialCount) : items;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">{title}</h2>
        <span className="text-xs text-[#8C6A4A]">{items.length}{unit}</span>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6A4D36]">
        <span>訪問済み / 全マンホール数</span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-[#2C765E] bg-[#EDFAF5]" />
          緑はコンプリート
        </span>
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-[#6A4D36]">まだスタンプがありません</p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-x-2 gap-y-3">
            {shown.map((item) => {
              const content = (
                <>
                  <span className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-dashed p-1 ${item.visited === item.total ? 'border-[#2C765E] bg-[#EDFAF5]' : 'border-[#B5483C]/60 bg-[#FFF8EB]'}`}>
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt="" width={48} height={48} loading="lazy" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Stamp aria-hidden="true" className="h-6 w-6 text-[#B5483C]/70" />
                    )}
                  </span>
                  <span className={`mt-1 h-[18px] w-full whitespace-nowrap text-center font-pixelJp font-bold leading-[18px] text-[#4F3828] ${nameSizeClass(item.name)}`}>{item.name}</span>
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
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-3 w-full rounded-[10px] border border-[#E2D3B0] bg-[#FFFDF7] py-2 font-pixelJp text-xs font-bold text-[#8C6A4A] transition hover:bg-white"
            >
              {expanded ? '閉じる' : `すべて見る（${items.length}${unit}）`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
