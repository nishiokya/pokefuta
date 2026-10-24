'use client';

import { useState } from 'react';
import PokemonMedal from '@/components/PokemonMedal';

type CollectionStamp = {
  name: string;
  visited: number;
  total: number;
  /** ポケモンはバッジと同じく代表マンホールの蓋の絵を入れる。無いもの（都道府県）は丸の中に名前を書く */
  manholeId?: number;
  /** 丸の中に書く名前（都道府県の「県」を落とした短い形など） */
  label?: string;
  href?: string;
};

const MEDAL_SIZE = 52;

// 「アローラキュウコン」のような長い名前が途中で折れないよう、字数で文字を小さくして1行に収める
const nameSizeClass = (name: string) => {
  if (name.length >= 8) return 'text-[8px] tracking-[-0.04em]';
  if (name.length === 7) return 'text-[9px] tracking-[-0.02em]';
  return 'text-[10px]';
};

/** 名前入りのメダル。PokemonMedal と同じく、揃うまでは白黒で薄く外周のリングで割合を見せ、揃うと金の縁にする */
function LabelMedal({ label, visited, total }: { label: string; visited: number; total: number }) {
  const earned = visited >= total;
  const rate = total > 0 ? Math.min(100, (visited / total) * 100) : 0;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full p-[3px] ${
        earned ? 'shadow-[0_0_0_2px_#F5D77A,0_4px_10px_rgba(217,162,27,0.35)]' : 'shadow-sm'
      }`}
      style={{
        width: MEDAL_SIZE,
        height: MEDAL_SIZE,
        background: earned ? 'conic-gradient(#E5B83E 100%, transparent 0)' : `conic-gradient(#7B63A8 ${rate}%, #EADFC8 0)`,
      }}
    >
      <span
        className={`flex h-full w-full items-center justify-center rounded-full border-2 border-white text-center font-pixelJp font-extrabold leading-tight ${
          earned ? 'bg-[#FFF3CF] text-[#4F3828]' : 'bg-[#F3EEE4] text-[#8C7F6E]'
        } ${label.length >= 4 ? 'text-[9px]' : 'text-[11px]'}`}
      >
        {label}
      </span>
      {earned && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFF3CF] text-[11px] shadow" aria-hidden="true">
          🏅
        </span>
      )}
    </span>
  );
}

/** 訪問した蓋を種類・都道府県ごとにまとめたメダルの一覧。再訪回数ではなく蓋数を表示する。 */
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
      <p className="mb-3 text-[11px] text-[#6A4D36]">訪問済み / 全マンホール数。全部回るとカラーになります</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#6A4D36]">まだスタンプがありません</p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-x-2 gap-y-3">
            {shown.map((item) => {
              const earned = item.visited >= item.total;
              const content = (
                <>
                  {item.manholeId !== undefined ? (
                    <PokemonMedal
                      name={item.name}
                      manholeId={item.manholeId}
                      state={earned ? 'earned' : 'progress'}
                      visited={item.visited}
                      total={item.total}
                      size={MEDAL_SIZE}
                    />
                  ) : (
                    <LabelMedal label={item.label ?? item.name} visited={item.visited} total={item.total} />
                  )}
                  <span className={`mt-1 h-[18px] w-full whitespace-nowrap text-center font-pixelJp font-bold leading-[18px] text-[#4F3828] ${nameSizeClass(item.name)}`}>{item.name}</span>
                  <span className={`text-[11px] font-bold tabular-nums ${earned ? 'text-[#B07F10]' : 'text-[#6A4D36]'}`}>{item.visited}/{item.total}</span>
                </>
              );
              const label = `${item.name}：${item.total}枚中${item.visited}枚訪問済み`;
              return (
                <li key={item.name} className="min-w-0">
                  {item.href ? (
                    <a href={item.href} aria-label={label} className="flex h-full flex-col items-center rounded-lg p-1 transition hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7B63A8]">{content}</a>
                  ) : (
                    <div className="flex h-full flex-col items-center p-1" aria-label={label}>{content}</div>
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
