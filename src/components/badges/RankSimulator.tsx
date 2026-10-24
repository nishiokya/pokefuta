'use client';

import { useState } from 'react';
import { PrefectureMedal, RANK_ICON, RANK_LABEL } from '@/components/RankMedal';
import { badgeRank, badgeRankThresholds } from '@/lib/badge-catalog';

const MAX_TOTAL = 60;

/** 説明ページの「ためしてみる」。全部の枚数と訪問した枚数を動かすと、メダルの段と輪がその場で変わる */
export default function RankSimulator() {
  const [total, setTotal] = useState(9);
  const [visited, setVisited] = useState(4);
  const v = Math.min(visited, total);
  const rank = badgeRank(v, total);
  const t = badgeRankThresholds(total);
  const next = rank === 'gold' ? null : rank === 'silver' ? t.gold : rank === 'bronze' ? t.silver : t.bronze;
  const nextRank = rank === 'silver' ? 'gold' : rank === 'bronze' ? 'silver' : 'bronze';

  const changeTotal = (n: number) => {
    setTotal(n);
    setVisited((cur) => Math.min(cur, n));
  };

  return (
    <div className="rounded-[12px] border border-dashed border-[#E2D3B0] bg-white/60 p-3">
      <p className="mb-2 font-pixelJp text-xs font-bold text-[#4F3828]">ためしてみる</p>
      <div className="flex items-center gap-4">
        <PrefectureMedal label={`${v}/${total}`} rank={rank} rate={(v / total) * 100} size={72} />
        <div className="min-w-0 flex-1 space-y-2 text-xs text-[#6A4D36]">
          <label className="block">
            <span className="flex justify-between font-pixelJp"><span>全部の枚数</span><span className="font-pixel tabular-nums">{total}枚</span></span>
            <input type="range" min={1} max={MAX_TOTAL} value={total} onChange={(e) => changeTotal(Number(e.target.value))} className="w-full accent-[#7B63A8]" />
          </label>
          <label className="block">
            <span className="flex justify-between font-pixelJp"><span>訪問した枚数</span><span className="font-pixel tabular-nums">{v}枚</span></span>
            <input type="range" min={0} max={total} value={v} onChange={(e) => setVisited(Number(e.target.value))} className="w-full accent-[#7B63A8]" />
          </label>
        </div>
      </div>
      <p className="mt-2 font-pixelJp text-xs text-[#4F3828]" aria-live="polite">
        {rank ? `${RANK_ICON[rank]} ${RANK_LABEL[rank]}` : 'まだ白黒'}
        {next !== null && <span className="text-[#6A4D36]">（あと{next - v}枚で{RANK_LABEL[nextRank]}）</span>}
      </p>
    </div>
  );
}
