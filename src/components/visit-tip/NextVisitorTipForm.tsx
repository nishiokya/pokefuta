'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { pokefutaEvents, type VisitTipSurface } from '@/lib/analytics/gtag';
import SuggestionChips from '@/components/comments/SuggestionChips';
import { VISIT_COMMENT_MAX_LENGTH } from '@/lib/visit-tip';

interface Props {
  visitId: string;
  manholeId?: number;
  surface: Exclude<VisitTipSurface, 'upload_form'>;
  title: string;
  description?: string;
  /** 保存できた本文。呼び出し側が画面上の写真のひとことを差し替えるのに使う */
  onSaved?: (comment: string) => void;
}

/**
 * 「次に来る人へひとこと」を後から書くフォーム。投稿完了画面で使う。
 * （蓋の詳細では入力欄を掲示板の1つにまとめたので使わない）
 * 書き先は掲示板ではなく**訪問のひとこと（visit.comment）**。写真と一緒に並び、
 * 代表写真の吹き出しにも載るので、書いた人から見て反映先が分かりやすい。
 */
export default function NextVisitorTipForm({
  visitId,
  manholeId,
  surface,
  title,
  description,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState('');
  const [usedSuggestion, setUsedSuggestion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表示を1回だけ数える（分母）。StrictMode の二重実行でも増えないよう ref で止める。
  const viewSentRef = useRef(false);
  useEffect(() => {
    if (viewSentRef.current) return;
    viewSentRef.current = true;
    pokefutaEvents.visitTipPromptView({ surface, manhole_id: manholeId });
  }, [surface, manholeId]);

  const content = draft.trim();
  const tooLong = content.length > VISIT_COMMENT_MAX_LENGTH;

  const handleSave = async () => {
    if (!content || tooLong || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: content }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(response.status === 401 ? 'ログインが切れました。もう一度ログインしてください' : '保存できませんでした');
        return;
      }
      pokefutaEvents.visitTipSaved({ surface, manhole_id: manholeId, used_suggestion: usedSuggestion });
      setSaved(true);
      onSaved?.(typeof data.comment === 'string' ? data.comment : content);
    } catch {
      setError('保存中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border border-[#c7e6d3] bg-[#eaf6ee] px-4 py-3 font-pixelJp text-xs font-bold text-[#1c6e49]">
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.6} />
        ありがとうございます！次に来る人の役に立ちます
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#efd9a3] bg-[#fffaf0] p-3.5">
      <p className="flex items-center gap-1.5 font-pixelJp text-[13px] font-bold text-[#7d4536]">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#b87d0a]" strokeWidth={2.2} />
        {title}
      </p>
      {description && (
        <p className="mt-1 font-pixelJp text-[11px] leading-relaxed text-[#8b816f]">{description}</p>
      )}
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="見つけた場所・駐車場・行き方など"
        rows={2}
        className="mt-2.5 w-full resize-y rounded-[12px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-xs leading-relaxed text-[#2c2a26] placeholder:text-[#9b917e] focus:outline-none focus:ring-1 focus:ring-[#bf5640]"
      />
      <div className="mt-2">
        <SuggestionChips
          value={draft}
          disabled={saving}
          onPick={(next) => {
            setDraft(next);
            setUsedSuggestion(true);
          }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`font-pixelJp text-[10px] ${tooLong ? 'text-[#bf5640]' : 'text-[#9b917e]'}`}>
          {content.length}/{VISIT_COMMENT_MAX_LENGTH}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={!content || tooLong || saving}
          className="rounded-full bg-[#bf5640] px-4 py-1.5 font-pixelJp text-xs font-bold text-white transition-colors hover:bg-[#a8483a] disabled:opacity-40"
        >
          {saving ? '保存中…' : 'ひとことを残す'}
        </button>
      </div>
      {error && <p className="mt-2 font-pixelJp text-xs text-[#bf5640]">{error}</p>}
    </div>
  );
}
