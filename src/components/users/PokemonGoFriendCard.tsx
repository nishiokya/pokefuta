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
/**
 * `navigator.clipboard` が無い / 権限で拒否される環境（古い WebView、
 * SNS アプリ内ブラウザ、非セキュアコンテキスト）向けの退避路。
 * 見えない textarea を選択して execCommand('copy') に落とす。
 */
function copyViaSelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}

export default function PokemonGoFriendCard({ code, note, displayName }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const formatted = formatFriendCode(code);

  useEffect(() => {
    // コピー率の分母。カードが出ていないページを分母に混ぜない。
    pokefutaEvents.goFriendCardView({ surface: 'user_visits' });
  }, []);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 4000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const handleCopy = async () => {
    // ゲームの入力欄は数字だけを受け付ける。表示は4桁区切りでも、コピーは正規化した12桁。
    const raw = normalizeFriendCode(code);
    try {
      await navigator.clipboard.writeText(raw);
      setCopyState('copied');
      pokefutaEvents.goFriendCodeCopy({ surface: 'user_visits' });
      return;
    } catch {
      // ここで諦めない。コピーがこのカードの用件なので、無反応は失敗と区別できない。
    }
    if (copyViaSelection(raw)) {
      setCopyState('copied');
      pokefutaEvents.goFriendCodeCopy({ surface: 'user_visits' });
    } else {
      setCopyState('failed');
    }
  };

  const copied = copyState === 'copied';

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
        {/* コピーが効かない環境では手で拾ってもらうので、選択できる状態にしておく */}
        <code
          className="select-all rounded-[9px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-sm font-bold tracking-wider text-[#2A2A2A]"
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

      {copyState === 'failed' && (
        <p
          role="status"
          className="mt-2 text-[11px] leading-4 font-bold text-[#bf5640]"
          style={{ fontFamily: ROUND }}
        >
          この環境ではコピーできませんでした。上のコードを長押し（PCでは選択）してコピーしてください。
        </p>
      )}

      <p className="mt-2.5 text-[10px] leading-4 text-[#9b917e]" style={{ fontFamily: ROUND }}>
        Pokémon GO の「プロフィール → フレンド → フレンド追加」に貼り付けてください。
      </p>
    </section>
  );
}
