import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 写真カードの中の「投稿者」リンク（その人の公開スタンプ帳へ）。
 *
 * カードは蓋のページへのリンクを全面に重ねる（z-[1]）作りなので、投稿者のリンクはその上（z-[2]）に置く。
 * リンクの中にリンクは入れられないため、この形が前提。見た目（色・文字の大きさ）は className で渡す。
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
    <Link href={href} aria-label={ariaLabel} className={`relative z-[2] ${className}`}>
      {children}
    </Link>
  );
}
