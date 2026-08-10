'use client';

import Link from 'next/link';
import { AlertCircle, Plus } from 'lucide-react';
import {
  DESIGN_MANHOLE_SUBMISSION_SUSPENDED,
  DESIGN_MANHOLE_SUBMISSION_SUSPENDED_MESSAGE,
} from '@/lib/design-manhole-submission-status';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

/**
 * デザインマンホール投稿への導線。
 * 停止中に導線を出したままだと、ログインまで求めた末に停止を知らせることになるので、
 * ボタンそのものを停止表示へ差し替える。
 *
 * `surface` はどの画面の導線かを表す（ファネルの分母は画面到達なので、これは内訳用）。
 */
export function SubmitCta({ className, surface = 'design_manhole' }: { className: string; surface?: string }) {
  const { trackSubmissionEntry } = useAnalytics();

  if (DESIGN_MANHOLE_SUBMISSION_SUSPENDED) {
    return (
      <span aria-disabled="true" className={`${className} cursor-not-allowed opacity-50`}>
        <Plus className="h-4 w-4" />
        投稿は一時停止中
      </span>
    );
  }
  return (
    <Link
      href="/design-manholes/new"
      onClick={() => trackSubmissionEntry({ submission_kind: 'design', surface })}
      className={className}
    >
      <Plus className="h-4 w-4" />
      投稿する
    </Link>
  );
}

/** 停止中だけ出る告知。閲覧は止めていないことと、ポケふた側は使えることを伝える。 */
export function SuspendedNotice({ className = 'mt-5' }: { className?: string }) {
  if (!DESIGN_MANHOLE_SUBMISSION_SUSPENDED) return null;
  return (
    <div
      role="status"
      className={`${className} flex items-start gap-2 rounded-lg border-2 border-[#B5483C]/40 bg-[#B5483C]/10 p-3 text-[#B5483C]`}
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="text-sm font-bold">{DESIGN_MANHOLE_SUBMISSION_SUSPENDED_MESSAGE}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#2A2A2A]/70">
          閲覧はそのままご利用いただけます。ポケふた（ポケモンマンホール）の写真投稿は
          <Link href="/upload" className="mx-0.5 underline hover:opacity-80">
            こちら
          </Link>
          から通常どおりどうぞ。
        </p>
      </div>
    </div>
  );
}
