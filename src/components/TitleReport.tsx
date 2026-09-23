'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Flag } from 'lucide-react';
import { pokefutaEvents } from '@/lib/analytics/gtag';
import type { ManholeTitle } from '@/types/database';

interface Props {
  manholeId: number;
  titles: ManholeTitle[];
  /** `null` は判定前。未ログインなら指摘の代わりにログイン導線を出す */
  isLoggedIn: boolean | null;
}

/**
 * タグ（称号）の間違い指摘。タグは図鑑側で自動生成したもので、ここでは直せない。
 * 指摘は公開のコメント欄ではなく manhole_title_report に貯め、運営が図鑑側で直す。
 *
 * 畳んだ状態は小さなリンク1つ。タグの並びを読む邪魔をしない。
 */
export default function TitleReport({ manholeId, titles, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  if (titles.length === 0) return null;

  const submit = async () => {
    if (!selectedKey || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/manholes/${manholeId}/title-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_key: selectedKey, reason: reason.trim() || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(response.status === 401 ? 'ログインが切れました。もう一度ログインしてください' : '送信できませんでした');
        return;
      }
      // 既に指摘済み（already_reported）でも同じ結果を見せる
      pokefutaEvents.titleReport({ surface: 'manhole_detail', manhole_id: manholeId, title_key: selectedKey });
      setDoneKeys((prev) => new Set(prev).add(selectedKey));
      setSelectedKey(null);
      setReason('');
    } catch {
      setError('送信中にエラーが発生しました');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 self-start font-pixelJp text-[11px] text-[#9b917e] underline decoration-[#e9dfc7] underline-offset-2 hover:text-[#bf5640]"
      >
        <Flag className="h-3 w-3" strokeWidth={2.2} />
        タグが違う？
      </button>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3">
      <p className="font-pixelJp text-xs font-bold text-[#2c2a26]">合っていないタグを選んでください</p>
      <p className="mt-0.5 font-pixelJp text-[10.5px] leading-relaxed text-[#9b917e]">
        運営に届きます（公開はされません）。確認して図鑑側のタグを直します。
      </p>

      {isLoggedIn === false ? (
        <Link
          href={`/login?redirect=${encodeURIComponent(`/manhole/${manholeId}`)}`}
          className="mt-2.5 inline-block rounded-[12px] bg-[#bf5640] px-4 py-2 font-pixelJp text-xs font-bold text-white"
        >
          ログインして指摘する
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
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-pixelJp text-[11px] font-bold transition-colors ${
                    done
                      ? 'border-[#c7e6d3] bg-[#e2f2e9] text-[#1f9d63]'
                      : selected
                      ? 'border-[#bf5640] bg-[#fdeae2] text-[#bf5640]'
                      : 'border-[#e9dfc7] bg-white text-[#6f6657] hover:border-[#bf5640]'
                  }`}
                >
                  {done && <Check className="h-3 w-3" strokeWidth={2.6} />}
                  {title.emoji || '★'} {title.label}
                  {done && ' 送信済み'}
                </button>
              );
            })}
          </div>
          {selectedKey && (
            <>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="どう違うか（任意）例: ビーチからは離れた駅前にあります"
                rows={2}
                maxLength={500}
                className="mt-2.5 w-full resize-y rounded-[12px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-xs leading-relaxed text-[#2c2a26] placeholder:text-[#9b917e] focus:outline-none focus:ring-1 focus:ring-[#bf5640]"
              />
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="mt-2 rounded-full bg-[#bf5640] px-4 py-1.5 font-pixelJp text-xs font-bold text-white disabled:opacity-50"
              >
                {sending ? '送信中…' : 'このタグの間違いを送る'}
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
  );
}
