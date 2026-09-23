'use client';

import { VISIT_TIP_SUGGESTIONS, appendVisitTipSuggestion } from '@/lib/visit-tip';

interface Props {
  value: string;
  onPick: (next: string) => void;
  disabled?: boolean;
}

/**
 * タップで入れる候補（駐車場あり / 駅から歩ける …）。書き出しの一語が一番重いので、
 * コメントを書く場所には全部これを付ける: 蓋のコメント欄・投稿画面・投稿完了画面。
 */
export default function SuggestionChips({ value, onPick, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VISIT_TIP_SUGGESTIONS.map((suggestion) => {
        const picked = value.includes(suggestion);
        return (
          <button
            key={suggestion}
            type="button"
            disabled={disabled || picked}
            onClick={() => onPick(appendVisitTipSuggestion(value, suggestion))}
            className={`rounded-full border px-2.5 py-1 font-pixelJp text-[11px] font-bold transition-colors disabled:cursor-default ${
              picked
                ? 'border-[#c7e6d3] bg-[#e2f2e9] text-[#1f9d63]'
                : 'border-[#e9dfc7] bg-white text-[#6f6657] hover:border-[#bf5640] hover:text-[#bf5640]'
            }`}
          >
            {picked ? '✓ ' : '+ '}
            {suggestion}
          </button>
        );
      })}
    </div>
  );
}
