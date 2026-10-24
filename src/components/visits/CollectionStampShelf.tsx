'use client';

import { useState } from 'react';
import PokemonMedal from '@/components/PokemonMedal';
import { PrefectureMedal, RANK_ICON, RANK_LABEL } from '@/components/RankMedal';
import { badgeRank, type BadgeRank } from '@/lib/badge-catalog';

export type CollectionStamp = {
  name: string;
  visited: number;
  total: number;
  /** ポケモンはバッジと同じく代表マンホールの蓋の絵を入れる。無いもの（都道府県）は丸の中に名前を書く */
  manholeId?: number;
  /** 丸の中に書く名前（都道府県の「県」を落とした短い形など） */
  label?: string;
  href?: string;
  /**
   * 段を外から決めるとき（公開スタンプ帳の都道府県は、制覇したあとにポケふたが増えても金を残す）。
   * 渡さなければ visited / total から決める
   */
  rank?: BadgeRank | null;
  /** 制覇したあとに増えた分まで回ってもう一度そろえたら2 */
  goldCount?: number;
  /** 制覇したあとに増えて、まだ回っていない枚数 */
  newCount?: number;
};

const MEDAL_SIZE = 52;
const RANKS: BadgeRank[] = ['gold', 'silver', 'bronze'];

// 「アローラキュウコン」のような長い名前が途中で折れないよう、字数で文字を小さくして1行に収める
const nameSizeClass = (name: string) => {
  if (name.length >= 8) return 'text-[8px] tracking-[-0.04em]';
  if (name.length === 7) return 'text-[9px] tracking-[-0.02em]';
  return 'text-[10px]';
};

const rankOf = (item: CollectionStamp) => (item.rank !== undefined ? item.rank : badgeRank(item.visited, item.total));

/** 都道府県・ポケモンのバッジ（金・銀・銅のメダル）の一覧。数えるのは訪問した蓋の枚数で、再訪は1枚 */
export default function CollectionStampShelf({ title, items, initialCount }: {
  title: string;
  items: CollectionStamp[];
  /** 指定すると最初はこの数だけ出し、残りは「すべて見る」で開く（ポケモンは100種を超えて下の段を押し出すため） */
  initialCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = initialCount !== undefined && items.length > initialCount;
  const shown = collapsible && !expanded ? items.slice(0, initialCount) : items;
  const rankCounts = RANKS.map((rank) => [rank, items.filter((item) => rankOf(item) === rank).length] as const);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">{title}</h2>
        <span className="flex gap-2 font-pixel text-xs text-[#6A4D36]" aria-label={rankCounts.map(([r, n]) => `${r === 'gold' ? '金' : r === 'silver' ? '銀' : '銅'}${n}`).join('・')}>
          {rankCounts.map(([rank, count]) => (
            <span key={rank}>{RANK_ICON[rank]}{count}</span>
          ))}
        </span>
      </div>
      <p className="mb-3 text-[11px] text-[#6A4D36]">訪問済み / 全マンホール数。1/3 で銅、2/3 で銀、全部で金</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#6A4D36]">まだありません</p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-x-2 gap-y-3">
            {shown.map((item) => {
              const rank = rankOf(item);
              const rate = item.total > 0 ? (item.visited / item.total) * 100 : 0;
              const content = (
                <>
                  {item.manholeId !== undefined ? (
                    <PokemonMedal name={item.name} manholeId={item.manholeId} rank={rank} rate={rate} size={MEDAL_SIZE} />
                  ) : (
                    <PrefectureMedal
                      label={item.label ?? item.name}
                      rank={rank}
                      rate={rate}
                      size={MEDAL_SIZE}
                      goldCount={item.goldCount}
                      newCount={item.newCount}
                    />
                  )}
                  <span className={`mt-1 h-[18px] w-full whitespace-nowrap text-center font-pixelJp font-bold leading-[18px] text-[#4F3828] ${nameSizeClass(item.name)}`}>{item.name}</span>
                  <span className={`text-[11px] font-bold tabular-nums ${rank === 'gold' ? 'text-[#B07F10]' : 'text-[#6A4D36]'}`}>{item.visited}/{item.total}</span>
                </>
              );
              // 段の印（🥇×2・+N）は aria-hidden なので、読み上げ用の名前に入れる
              const label = [
                `${item.name}：${item.total}枚中${item.visited}枚訪問済み`,
                rank && `${RANK_LABEL[rank]}${rank === 'gold' && (item.goldCount ?? 1) > 1 ? `×${item.goldCount}` : ''}`,
                (item.newCount ?? 0) > 0 && `新しいポケふた${item.newCount}枚`,
              ].filter(Boolean).join('、');
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
              {expanded ? '閉じる' : `すべて見る（${items.length}）`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
