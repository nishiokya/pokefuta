'use client';

import { useState } from 'react';
import { ScanSearch } from 'lucide-react';

/**
 * ぬいぐるみの特集（ベータ）: 切り抜き（蓋とぬいぐるみを別々に並べる）と、元の写真に AI が見つけた枠を
 * 重ねた表示の切り替え。
 * 一覧（targetId の要素）の data-ai-boxes を on / off にするだけ。枠そのものはサーバーで描いてあり、
 * CSS（group-data-[ai-boxes=on]/grid）で出し入れする。
 */
export default function PlushAiBoxToggle({ targetId }: { targetId: string }) {
  const [on, setOn] = useState(false);
  const toggle = () => {
    const next = !on;
    setOn(next);
    const el = document.getElementById(targetId);
    if (el) el.dataset.aiBoxes = next ? 'on' : 'off';
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ring-1 transition ${
        on ? 'bg-[#7B63A8] text-white ring-[#7B63A8]' : 'bg-white text-[#5B4688] ring-[#7B63A8]/40 hover:bg-[#F3EEFA]'
      }`}
    >
      <ScanSearch className="h-3.5 w-3.5" />
      {on ? '切り抜きに戻す' : '元の写真で見る（AI の枠つき）'}
    </button>
  );
}
