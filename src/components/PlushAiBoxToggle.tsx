'use client';

import { useState } from 'react';
import { ScanSearch } from 'lucide-react';

/**
 * ぬいぐるみの特集（ベータ）: AI が見つけた蓋とぬいぐるみの枠を、一覧の写真に重ねて見せる切り替え。
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
      {on ? 'AI の枠を隠す' : 'AI が見つけた枠を見る'}
    </button>
  );
}
