'use client';

import Link from 'next/link';

const MAX_LENGTH = 1000;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  /** 未ログインなら入力欄ではなくログイン導線を出す */
  isLoggedIn: boolean;
  /** 最初のキーストロークで1回だけ呼ぶ（呼び分けは親が持つ） */
  onComposeStart: () => void;
  /** 未ログインで導線を叩いた。ゲート撤去の効果を示す唯一の数字 */
  onLoginPromptClick: () => void;
  placeholder?: string;
}

export default function CommentComposer({
  value,
  onChange,
  onSubmit,
  submitting,
  isLoggedIn,
  onComposeStart,
  onLoginPromptClick,
  placeholder = 'この場所のことを書いてみる（駐車場、行き方、見つけたときのこと…）',
}: Props) {
  // 未ログインでも「書ける場所がある」ことは見せる。
  // 以前は入力欄ごと存在せず、蓋482枚のほぼ全てで未ログイン訪問者には
  // コメント欄が1ピクセルも描画されていなかった。
  if (!isLoggedIn) {
    return (
      <div className="rounded-[14px] border border-dashed border-[#e9dfc7] bg-[#fffdf7] p-3">
        <p className="mb-2 font-pixelJp text-xs leading-relaxed text-[#6f6657]">
          ログインすると、このポケふたにコメントを書けます。
        </p>
        <Link
          href="/login?mode=login"
          onClick={onLoginPromptClick}
          className="inline-block rounded-[12px] bg-[#bf5640] px-4 py-2 font-pixelJp text-xs font-bold text-white"
        >
          ログインして書く
        </Link>
      </div>
    );
  }

  const remaining = MAX_LENGTH - value.length;
  const overLimit = remaining < 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        value={value}
        onChange={(e) => {
          if (value.length === 0 && e.target.value.length > 0) {
            onComposeStart();
          }
          onChange(e.target.value);
        }}
        placeholder={placeholder}
        rows={3}
        // maxLength は付けない。上限で黙って切り捨てると、書いた本人に
        // 「なぜ途中で止まるのか」が見えない。カウンタで見せて送信側で弾く。
        className="w-full resize-y rounded-[12px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-xs leading-relaxed text-[#2c2a26] placeholder:text-[#9b917e] focus:outline-none focus:ring-1 focus:ring-[#bf5640]"
      />
      <div className="flex items-center justify-between">
        <span
          className={`font-pixelJp text-[10px] ${overLimit ? 'text-[#bf5640]' : 'text-[#9b917e]'}`}
        >
          {value.length}/{MAX_LENGTH}
        </span>
        <button
          type="submit"
          disabled={submitting || !value.trim() || overLimit}
          className="rounded-[12px] bg-[#bf5640] px-4 py-2 font-pixelJp text-xs font-bold text-white disabled:opacity-50"
        >
          {submitting ? '投稿中…' : '投稿'}
        </button>
      </div>
    </form>
  );
}
