'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * 本文先頭の戻る導線。
 *
 * ヘッダー（SiteChrome）は全ページ共通の固定内容なので戻るボタンを持たない。
 * `/p/[photoId]` や `/manhole/[id]` は OGP 経由の共有リンクで深い階層に直接
 * 着地する入口で、履歴が無い状態で来ることがある。ここが唯一の文脈復帰導線に
 * なるので、**必ずファーストビュー内（本文の最上部）に置くこと**。
 *
 * `href` 省略時は履歴を1つ戻る。遷移元が定まらないページで使う。
 */
export default function Breadcrumb({ href, label }: { href?: string; label: string }) {
  const router = useRouter();

  const className = 'inline-flex items-center gap-1.5 py-2 text-sm font-bold text-[#4F3828] transition hover:opacity-70';
  const style = { minHeight: 'var(--chrome-tap-min)' };
  const body = (
    <>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </>
  );

  return (
    <nav aria-label="パンくず" className="mb-1">
      {href ? (
        <Link href={href} className={className} style={style}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={() => router.back()} className={className} style={style}>
          {body}
        </button>
      )}
    </nav>
  );
}
