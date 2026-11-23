'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Gift } from 'lucide-react';
import { copyText } from '@/lib/copy-text';
import { formatFriendCode, normalizeFriendCode } from '@/lib/pokemon-go-friend-code';
import { giftDaysLeft } from '@/lib/visit-gift';

type Giver = { visit_id: string; display_name: string | null; friend_code: string; friend_note: string | null; gift_until: string; is_own: boolean };
type Own = { visit_id: string; gift_until: string | null; is_public: boolean; can_offer: boolean; friend_open: boolean };

export default function ManholeGiftSection({ manholeId, isLoggedIn }: { manholeId: number; isLoggedIn: boolean }) {
  const [givers, setGivers] = useState<Giver[]>([]);
  const [own, setOwn] = useState<Own | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const response = await fetch(`/api/manholes/${manholeId}/gifts`);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('読み込めませんでした');
    setGivers(data.givers); setOwn(data.own); setLoaded(true);
  }, [manholeId]);
  useEffect(() => { void reload().catch(() => setLoaded(true)); }, [reload]);
  const toggle = async () => {
    if (!own || saving) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/visits/${own.visit_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gift: !own.gift_until }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === 'gift_window_passed' ? '撮影から10日を過ぎた記録には付けられません。' : '更新できませんでした。');
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : '更新できませんでした。'); }
    finally { setSaving(false); }
  };
  if (!loaded || (!givers.length && !own)) return null;
  return <section className="my-5 rounded-2xl border border-[#e9dfc7] bg-[#fffdf7] p-4" aria-labelledby="gift-heading">
    <h2 id="gift-heading" className="flex items-center gap-2 font-pixelJp text-base font-bold text-[#6A4D36]"><Gift className="h-5 w-5 text-[#bf5640]"/>このポケふたのギフト</h2>
    <p className="mt-1 text-xs text-[#887760]">Pokémon GOでこのポケふたのギフトを配れます</p>
    <p className="mt-1 text-xs text-[#887760]">コードをコピーして Pokémon GO でフレンド申請すると、このポケふたのギフトを送ってもらえます。</p>
    {givers.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2">{givers.map(g => <li key={g.visit_id} className="rounded-xl border border-[#eee4d3] bg-white p-3">
      <div className="flex items-center justify-between gap-2"><strong className="truncate font-pixelJp text-sm text-[#4F3828]">{g.display_name || 'トレーナー'}</strong><span className="shrink-0 text-xs text-[#bf5640]">あと {giftDaysLeft(g.gift_until)}日</span></div>
      {g.friend_note && <p className="mt-1 text-xs text-[#6A4D36]">{g.friend_note}</p>}
      <div className="mt-2 flex items-center gap-2"><code className="select-all rounded bg-[#fbf6ea] px-2 py-1 text-sm tracking-wider">{formatFriendCode(g.friend_code)}</code><button type="button" onClick={async()=>{ const ok=await copyText(normalizeFriendCode(g.friend_code)); setCopied(ok?g.visit_id:null); }} className="inline-flex items-center gap-1 rounded-full bg-[#fdf1ec] px-3 py-1.5 text-xs font-bold text-[#bf5640]">{copied===g.visit_id?<Check className="h-3.5 w-3.5"/>:<Copy className="h-3.5 w-3.5"/>}{copied===g.visit_id?'コピーしました':'コードをコピー'}</button></div>
    </li>)}</ul>}
    {isLoggedIn && own && <div className="mt-4 border-t border-[#eee4d3] pt-3"><button type="button" disabled={saving || (!own.gift_until && (!own.can_offer || !own.is_public))} onClick={toggle} className="rounded-full bg-[#bf5640] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving?'更新中…':own.gift_until?'配り終わった':'配れます'}</button>
      {!own.friend_open && <p className="mt-2 text-xs text-[#887760]">一覧に載るにはトレーナーコードの公開が必要です。<Link className="underline text-[#bf5640]" href="/profile">プロフィールで設定</Link></p>}
      {!own.is_public && <p className="mt-2 text-xs text-[#887760]">記録を公開すると一覧に載ります。</p>}
      {!own.gift_until && !own.can_offer && <p className="mt-2 text-xs text-[#887760]">撮影から10日以内の公開記録に印を付けられます。</p>}{message && <p role="status" className="mt-2 text-xs text-[#bf5640]">{message}</p>}</div>}
  </section>;
}
