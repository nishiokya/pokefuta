'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Gift, Instagram, UserRound } from 'lucide-react';
import PosterAvatar from '@/components/users/PosterAvatar';
import { copyText } from '@/lib/copy-text';
import { formatFriendCode, normalizeFriendCode } from '@/lib/pokemon-go-friend-code';
import { giftDaysLeft } from '@/lib/visit-gift';

type Giver = {
  visit_id: string;
  public_user_id: string | null;
  display_name: string | null;
  friend_code: string;
  friend_note: string | null;
  gift_until: string;
  x_url: string | null;
  instagram_url: string | null;
  is_own: boolean;
};
type Own = { visit_id: string; gift_until: string | null; is_public: boolean; can_offer: boolean; friend_open: boolean };

export default function ManholeGiftSection({ manholeId, isLoggedIn, onAvailabilityChange }: {
  manholeId: number;
  isLoggedIn: boolean;
  onAvailabilityChange: (manholeId: number, hasGivers: boolean) => void;
}) {
  const [givers, setGivers] = useState<Giver[]>([]);
  const [own, setOwn] = useState<Own | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const response = await fetch(`/api/manholes/${manholeId}/gifts`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('読み込めませんでした');
    setGivers(data.givers); setOwn(data.own); setLoaded(true);
    onAvailabilityChange(manholeId, data.givers.length > 0);
  }, [manholeId, onAvailabilityChange]);
  useEffect(() => { void reload().catch(() => setLoaded(true)); }, [reload]);
  // トップからのリンクは、非同期でギフト欄が出た後に見出しへ移動する。
  useEffect(() => {
    if (loaded && window.location.hash === '#gift-heading') {
      document.getElementById('gift-heading')?.scrollIntoView();
    }
  }, [loaded]);
  const toggle = async () => {
    if (!own || saving) return;
    setSaving(true); setMessage('');
    try {
      const stopping = Boolean(own.gift_until);
      const response = stopping
        ? await fetch(`/api/manholes/${manholeId}/gifts`, { method: 'DELETE' })
        : await fetch(`/api/visits/${own.visit_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gift: true }),
        });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === 'gift_window_passed' ? '撮影から10日を過ぎた記録には付けられません。' : '更新できませんでした。');
      if (stopping) {
        const remaining = givers.filter((giver) => !giver.is_own);
        setGivers(remaining);
        setOwn({ ...own, gift_until: null });
        onAvailabilityChange(manholeId, remaining.length > 0);
        setMessage('ギフトの配布を終了しました。');
      }
      try {
        await reload();
      } catch {
        setMessage('設定は保存されました。最新の表示を確認するにはページを再読み込みしてください。');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '更新できませんでした。'); }
    finally { setSaving(false); }
  };
  if (!loaded || (!givers.length && !own)) return null;
  const otherGivers = givers.filter((giver) => !giver.is_own);
  return <section className="my-5 rounded-2xl border border-[#e9dfc7] bg-[#fffdf7] p-4" aria-labelledby="gift-heading">
    <h2 id="gift-heading" className="flex scroll-mt-24 items-center gap-2 font-pixelJp text-base font-bold text-[#6A4D36]"><Gift className="h-5 w-5 text-[#bf5640]"/>このポケふたのギフト</h2>
    {otherGivers.length > 0 && (
      <>
        <p className="mt-1 text-sm font-bold text-[#6A4D36]">Pokémon GOのギフトを配布できるトレーナーがいます</p>
        <p className="mt-1 text-xs leading-relaxed text-[#6f6657]">
          ギフトを希望する方は、トレーナーコードをコピーして Pokémon GO でフレンド申請してください。
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {otherGivers.map((giver) => {
            const name = giver.display_name || 'トレーナー';
            const isCopied = copied === giver.visit_id;
            return (
              <li key={giver.visit_id} className="rounded-xl border border-[#eee4d3] bg-white p-3">
                <div className="flex items-center gap-2">
                  <PosterAvatar
                    publicUserId={giver.public_user_id}
                    size={32}
                    fallback={<span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fbf6ea] text-[#6A4D36]"><UserRound className="h-4 w-4" /></span>}
                  />
                  <strong className="min-w-0 flex-1 break-words font-pixelJp text-sm text-[#4F3828]">{name}</strong>
                  {giver.x_url && (
                    <a href={giver.x_url} target="_blank" rel="noopener noreferrer" aria-label={`${name}さんのX`} className="shrink-0 rounded-full border border-[#e9dfc7] px-2.5 py-1 text-xs font-bold text-[#4F3828]">X</a>
                  )}
                  <span className="shrink-0 text-xs text-[#bf5640]">あと {giftDaysLeft(giver.gift_until)}日</span>
                </div>
                {giver.friend_note && <p className="mt-2 break-words text-xs text-[#6A4D36]">{giver.friend_note}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code translate="no" className="select-all whitespace-nowrap rounded bg-[#fbf6ea] px-2 py-1 text-sm tracking-wider">{formatFriendCode(giver.friend_code)}</code>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyText(normalizeFriendCode(giver.friend_code));
                      setCopied(ok ? giver.visit_id : null);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-[#fdf1ec] px-3 py-1.5 text-xs font-bold text-[#bf5640]"
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {isCopied ? 'コピーしました' : 'コードをコピー'}
                  </button>
                </div>
                {giver.instagram_url && (
                  <div className="mt-2 flex flex-wrap gap-2">
                      <a href={giver.instagram_url} target="_blank" rel="noopener noreferrer" aria-label={`${name}さんのInstagram`} className="inline-flex items-center gap-1 rounded-full border border-[#e9dfc7] px-3 py-1 text-xs font-bold text-[#4F3828]">
                        <Instagram aria-hidden="true" className="h-3.5 w-3.5" />Instagram
                      </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-[#6f6657]">
          フレンド申請やギフトのやり取りは当事者間でお願いします。写真館では、やり取りの管理や仲介は行いません。
        </p>
      </>
    )}
    {isLoggedIn && own && <div className="mt-4 border-t border-[#eee4d3] pt-3">
      <h3 className="text-sm font-bold text-[#4F3828]">自分のギフト配布</h3>
      {own.gift_until && (
        <p className="mt-1 text-xs text-[#6f6657]">
          {own.is_public && own.friend_open ? `配布中（あと ${giftDaysLeft(own.gift_until)}日）` : '配布設定中（一覧には表示されていません）'}
        </p>
      )}
      <button type="button" disabled={saving || (!own.gift_until && (!own.can_offer || !own.is_public))} onClick={toggle} className="mt-2 rounded-full bg-[#bf5640] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving?'更新中…':own.gift_until?'配り終わった':'配れます'}</button>
      {!own.friend_open && <p className="mt-2 text-xs text-[#887760]">一覧に載るにはトレーナーコードの公開が必要です。<Link className="underline text-[#bf5640]" href="/profile">プロフィールで設定</Link></p>}
      {!own.is_public && <p className="mt-2 text-xs text-[#887760]">記録を公開すると一覧に載ります。</p>}
      {!own.gift_until && !own.can_offer && <p className="mt-2 text-xs text-[#887760]">撮影から10日以内の公開記録に印を付けられます。</p>}{message && <p role="status" className="mt-2 text-xs text-[#bf5640]">{message}</p>}</div>}
  </section>;
}
