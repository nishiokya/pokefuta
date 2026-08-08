'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useHasNavigatedInApp } from '@/components/SiteChrome';

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
  // SPA 遷移では document.referrer が空のままなので、SiteChrome が数えている
  // アプリ内遷移の有無と OR で判定する。referrer だけだと
  // 「/ を新規タブで開いて Link で /manhole/209 へ移動」を直接着地と誤判定する
  const hasNavigatedInApp = useHasNavigatedInApp();
  // SSR とハイドレーション直後は false（＝リンク）にしておき、確認できてから切り替える
  const [cameFromSameOrigin, setCameFromSameOrigin] = useState(false);

  useEffect(() => {
    // 初回ロードが同一オリジンからの通常遷移（フルリロード）だったか。
    // history.length は直接着地でも 1 より大きくなる環境があるため単独では使わない
    setCameFromSameOrigin(
      document.referrer !== '' &&
        new URL(document.referrer, location.href).origin === location.origin &&
        window.history.length > 1
    );
  }, []);

  const canGoBack = hasNavigatedInApp || cameFromSameOrigin;

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
