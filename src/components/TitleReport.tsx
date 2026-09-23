'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, Flag, Plus } from 'lucide-react';
import { pokefutaEvents } from '@/lib/analytics/gtag';
import type { ManholeTitle } from '@/types/database';

/** 提案の選択肢を表す番兵。タグの key と衝突しないよう記号で始める */
const SUGGEST = '@suggest';
const SUGGESTED_LABEL_MAX = 50;

interface Props {
  manholeId: number;
  titles: ManholeTitle[];
  /** `null` は判定前。未ログインなら指摘の代わりにログイン導線を出す */
  isLoggedIn: boolean | null;
  /** タグの並び。入口のボタンをこの並びの末尾に置く（専用の1行を使わない） */
  children: ReactNode;
}

/**
 * タグ（称号）の間違い指摘と、足りないタグの提案。タグは図鑑側で自動生成したもので、
 * ここでは直せない。公開のコメント欄ではなく manhole_title_report に貯め、運営が図鑑側で直す。
 *
 * 入口はタグの並びの末尾の小さなチップ1つ。以前はタグの下に専用の1行を取っていた。
 */
export default function TitleReport({ manholeId, titles, isLoggedIn, children }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [suggestedLabel, setSuggestedLabel] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [suggestedDone, setSuggestedDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const suggesting = selectedKey === SUGGEST;
  const label = suggestedLabel.trim();
  const canSubmit = suggesting ? label.length > 0 && label.length <= SUGGESTED_LABEL_MAX : !!selectedKey;

  const submit = async () => {
    if (!selectedKey || !canSubmit || sending) return;
    setSending(true);
    setError(null);
    try {
      const body = suggesting
        ? { kind: 'suggest', suggested_label: label, reason: reason.trim() || undefined }
        : { kind: 'wrong', title_key: selectedKey, reason: reason.trim() || undefined };
      const response = await fetch(`/api/manholes/${manholeId}/title-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(response.status === 401 ? 'ログインが切れました。もう一度ログインしてください' : '送信できませんでした');
        return;
      }
      // 既に送信済み（already_reported）でも同じ結果を見せる
      if (suggesting) {
        pokefutaEvents.titleReport({ surface: 'manhole_detail', manhole_id: manholeId, kind: 'suggest' });
        setSuggestedDone((prev) => [...prev, label]);
        setSuggestedLabel('');
      } else {
        pokefutaEvents.titleReport({
          surface: 'manhole_detail',
          manhole_id: manholeId,
          kind: 'wrong',
          title_key: selectedKey,
        });
        setDoneKeys((prev) => new Set(prev).add(selectedKey));
      }
      setSelectedKey(null);
      setReason('');
    } catch {
      setError('送信中にエラーが発生しました');
    } finally {
      setSending(false);
    }
  };

  const chipClass = (state: 'done' | 'selected' | 'idle') =>
    `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-pixelJp text-[11px] font-bold transition-colors ${
      state === 'done'
        ? 'border-[#c7e6d3] bg-[#e2f2e9] text-[#1f9d63]'
        : state === 'selected'
        ? 'border-[#bf5640] bg-[#fdeae2] text-[#bf5640]'
        : 'border-[#e9dfc7] bg-white text-[#6f6657] hover:border-[#bf5640]'
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {children}
        {/* 入口は旗アイコンだけ。文字を付けると幅が増え、最後のバッジの後ろで
            折り返して1行を丸ごと使っていた。名前は aria-label と title で渡す。 */}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={titles.length > 0 ? 'タグが違う・足りないタグを提案する' : 'タグを提案する'}
            title={titles.length > 0 ? 'タグが違う？・足りないタグを提案' : 'タグを提案'}
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[#e9dfc7] bg-[#fffdf7] text-[#9b917e] hover:border-[#bf5640] hover:text-[#bf5640]"
          >
            <Flag className="h-3 w-3" strokeWidth={2.2} />
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3">
          <p className="font-pixelJp text-xs font-bold text-[#2c2a26]">
            {titles.length > 0 ? '合っていないタグを選ぶか、足りないタグを提案してください' : '足りないタグを提案してください'}
          </p>
          <p className="mt-0.5 font-pixelJp text-[10.5px] leading-relaxed text-[#9b917e]">
            運営に届きます（公開はされません）。確認して図鑑側のタグを直したり、新しいタグを足したりします。
          </p>

          {isLoggedIn === false ? (
            <Link
              href={`/login?redirect=${encodeURIComponent(`/manhole/${manholeId}`)}`}
              className="mt-2.5 inline-block rounded-[12px] bg-[#bf5640] px-4 py-2 font-pixelJp text-xs font-bold text-white"
            >
              ログインして送る
            </Link>
          ) : (
            <>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {titles.map((title) => {
                  const done = doneKeys.has(title.key);
                  const selected = selectedKey === title.key;
                  return (
                    <button
                      key={title.key}
                      type="button"
                      disabled={done || sending}
                      aria-pressed={selected}
                      onClick={() => setSelectedKey(selected ? null : title.key)}
                      className={chipClass(done ? 'done' : selected ? 'selected' : 'idle')}
                    >
                      {done && <Check className="h-3 w-3" strokeWidth={2.6} />}
                      {title.emoji || '★'} {title.label}
                      {done && ' 送信済み'}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={sending}
                  aria-pressed={suggesting}
                  onClick={() => setSelectedKey(suggesting ? null : SUGGEST)}
                  className={chipClass(suggesting ? 'selected' : 'idle')}
                >
                  <Plus className="h-3 w-3" strokeWidth={2.6} />
                  新しいタグを提案
                </button>
              </div>

              {suggestedDone.length > 0 && (
                <p className="mt-2 font-pixelJp text-[11px] text-[#1f9d63]">
                  提案を送りました: {suggestedDone.join('、')}
                </p>
              )}

              {selectedKey && (
                <>
                  {suggesting && (
                    <input
                      value={suggestedLabel}
                      onChange={(event) => setSuggestedLabel(event.target.value)}
                      placeholder="例: 温泉のポケふた"
                      maxLength={SUGGESTED_LABEL_MAX}
                      className="mt-2.5 w-full rounded-[12px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-xs text-[#2c2a26] placeholder:text-[#9b917e] focus:outline-none focus:ring-1 focus:ring-[#bf5640]"
                    />
                  )}
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={
                      suggesting
                        ? '理由（任意）例: 蓋のすぐ隣が足湯です'
                        : 'どう違うか（任意）例: ビーチからは離れた駅前にあります'
                    }
                    rows={2}
                    maxLength={500}
                    className="mt-2 w-full resize-y rounded-[12px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-xs leading-relaxed text-[#2c2a26] placeholder:text-[#9b917e] focus:outline-none focus:ring-1 focus:ring-[#bf5640]"
                  />
                  <button
                    type="button"
                    onClick={submit}
                    disabled={sending || !canSubmit}
                    className="mt-2 rounded-full bg-[#bf5640] px-4 py-1.5 font-pixelJp text-xs font-bold text-white disabled:opacity-50"
                  >
                    {sending ? '送信中…' : suggesting ? 'このタグを提案する' : 'このタグの間違いを送る'}
                  </button>
                </>
              )}
            </>
          )}

          {error && <p className="mt-2 font-pixelJp text-xs text-[#bf5640]">{error}</p>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 block font-pixelJp text-[11px] text-[#9b917e] underline decoration-[#e9dfc7] underline-offset-2"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
