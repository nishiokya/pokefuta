import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 写真カードの中の「投稿者」リンク（その人の公開スタンプ帳へ）。
 *
 * カードは蓋のページへのリンクを全面に重ねる（z-[1]）作りなので、投稿者のリンクはその上（z-[2]）に置く。
 * リンクの中にリンクは入れられないため、この形が前提。見た目（色・文字の大きさ）は className で渡す。
 *
 * 文字の高さ（18px 前後）のままだと、指で押すと外れて下の全面リンク（蓋のページ）へ黙って飛ぶ。
 * そこで ::before で上下に13pxずつ当たり判定だけ広げる（計44px前後）。見た目と並びは変わらない。
 */
export default function PosterLink({
  href,
  ariaLabel,
  className = '',
  children,
}: {
  href: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-label={ariaLabel} className={`relative z-[2] before:absolute before:inset-x-0 before:-inset-y-[13px] before:content-[''] ${className}`}>
      {children}
    </Link>
  );
}
