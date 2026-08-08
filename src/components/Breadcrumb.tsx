'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
 * `href` を渡せばただのリンク。`fallbackHref` を渡した場合は履歴を1つ戻るが、
 * **X・OGP・新規タブからの直接着地では履歴が無く `router.back()` が無反応、または
 * 外部サイトへ戻ってしまう**ため、そのときは `fallbackHref` へのリンクとして描画する。
 */
type BreadcrumbProps = {
  label: string;
  /** 常にこの URL へ戻る */
  href?: string;
  /** 履歴があれば戻り、無ければこの URL へ。href とは排他 */
  fallbackHref?: string;
};

const className =
  'inline-flex items-center gap-1.5 py-2 text-sm font-bold text-[#4F3828] transition hover:opacity-70';
const style = { minHeight: 'var(--chrome-tap-min)' };

export default function Breadcrumb({ href, fallbackHref, label }: BreadcrumbProps) {
  const router = useRouter();
  // 同一タブ内で遷移してきた場合だけ router.back() が意味を持つ。
  // SSR とハイドレーション直後は false（＝リンク）にしておき、履歴を確認できてから切り替える
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // history.length は直接着地でも 1 より大きくなる環境があるため、
    // 「このタブでの遷移で来たか」を referrer と合わせて判定する
    const sameOriginReferrer =
      typeof document !== 'undefined' &&
      document.referrer !== '' &&
      new URL(document.referrer, location.href).origin === location.origin;
    setCanGoBack(window.history.length > 1 && sameOriginReferrer);
  }, []);

  const body = (
    <>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </>
  );

  if (!href && fallbackHref && canGoBack) {
    return (
      <nav aria-label="パンくず" className="mb-1">
        <button type="button" onClick={() => router.back()} className={className} style={style}>
          {body}
        </button>
      </nav>
    );
  }

  return (
    <nav aria-label="パンくず" className="mb-1">
      <Link href={href ?? fallbackHref ?? '/'} className={className} style={style}>
        {body}
      </Link>
    </nav>
  );
}
