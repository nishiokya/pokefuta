'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { pokefutaEvents } from '@/lib/analytics/gtag';
import { formatFriendCode, normalizeFriendCode } from '@/lib/pokemon-go-friend-code';

const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

type Props = {
  /** 数字12桁。募集スイッチが OFF のユーザーではそもそも渡ってこない。 */
  code: string;
  note: string | null;
  displayName: string;
};

/**
 * 公開スタンプ帳の「Pokémon GOフレンド募集中」カード。
 *
 * Web から Pokémon GO の相手プロフィールを直接開いてワンタップで申請する
 * 公式リンクは無い（2026-08-10 時点）。スマホではコードをコピーして
 * ゲーム内の「プロフィール → フレンド → フレンド追加」に貼る流れになるので、
 * コピーを一番押しやすいところに置く。
 */
export default function PokemonGoFriendCard({ code, note, displayName }: Props) {
  const [copied, setCopied] = useState(false);
  const formatted = formatFriendCode(code);

  useEffect(() => {
    // コピー率の分母。カードが出ていないページを分母に混ぜない。
    pokefutaEvents.goFriendCardView({ surface: 'user_visits' });
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    // ゲームの入力欄は数字だけを受け付ける。表示は4桁区切りでも、コピーは正規化した12桁。
    const raw = normalizeFriendCode(code);
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      pokefutaEvents.goFriendCodeCopy({ surface: 'user_visits' });
    } catch {
      // クリップボードが使えない環境（権限拒否・古い WebView）では
      // コードは画面に出ているので手で入力できる。黙って何もしない。
    }
  };

  return (
    <section
      className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm"
      aria-label={`${displayName}さんのPokémon GOフレンド募集`}
    >
      <p style={{ fontFamily: ROUND, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', textTransform: 'uppercase' }}>
        Pokémon GO フレンド募集中
      </p>

      {note && (
        <p className="mt-1.5 text-xs leading-5 text-[#6A4D36]" style={{ fontFamily: ROUND }}>
          {note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          className="rounded-[9px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-sm font-bold tracking-wider text-[#2A2A2A]"
          translate="no"
        >
          {formatted}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#bf5640]/30 bg-[#fdf1ec] px-4 py-2 font-pixelJp text-xs font-bold text-[#bf5640] transition hover:bg-[#f8e3da]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'コピーしました' : 'コードをコピー'}
        </button>
      </div>

      <p className="mt-2.5 text-[10px] leading-4 text-[#9b917e]" style={{ fontFamily: ROUND }}>
        Pokémon GO の「プロフィール → フレンド → フレンド追加」に貼り付けてください。
      </p>
    </section>
  );
}
