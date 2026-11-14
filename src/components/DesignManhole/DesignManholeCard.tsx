import Link from 'next/link';
import { ChevronRight, MapPin, UserRound } from 'lucide-react';
import { formatDateJaJst } from '@/lib/date';
import PosterRegularBadge from '@/components/PosterRegularBadge';
import PosterAvatar from '@/components/users/PosterAvatar';
import type { DesignManhole } from '@/types/database';

/**
 * /design-manholes の一覧のカード。/photos/plush・/photos/snow の TaggedPhotoFeature のカードと同じ作り
 * （写真の正方形・その下に名前・投稿者・投稿日・ひとこと）。
 * 写真と投稿者の欄を押すと投稿者のページへ。公開IDの無い投稿者はそのマンホールのページへ。
 * マンホールのページへのリンクは名前の行に別に置く（詳細ページを一覧から辿れるようにしておく。検索用）。
 */
export default function DesignManholeCard({
  designManhole: dm,
  posterPublicId,
  eager,
}: {
  designManhole: DesignManhole;
  posterPublicId: string | null;
  eager: boolean;
}) {
  const title = dm.title || 'デザインマンホール';
  const posterName = dm.submitter_name || '投稿者';
  const detailHref = `/design-manholes/${dm.id}`;
  const href = posterPublicId ? `/users/${encodeURIComponent(posterPublicId)}/visits` : detailHref;
  // カード（写真と投稿者の欄）に aria-label を張るので、中の文字は読み上げられない。同じ内容をここに書く
  const ariaLabel = [
    title,
    `投稿 ${formatDateJaJst(dm.created_at)}`, // 表示と同じ JST（本番のサーバーは UTC）
    `投稿者 ${posterName}`,
    dm.description ? `ひとこと ${dm.description}` : null,
    posterPublicId ? '投稿者のページへ' : 'マンホールを見る',
  ].filter(Boolean).join('、');

  return (
    <div className="group overflow-hidden rounded-[10px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-[#FFB347]">
      <Link href={href} aria-label={ariaLabel} className="block focus:outline-none">
        <div className="relative aspect-square overflow-hidden bg-[#EFE4CC]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dm.photo_url}
            alt=""
            width={400}
            height={400}
            loading={eager ? 'eager' : 'lazy'}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </div>
      </Link>
      <div className="px-2.5 py-2 sm:px-3">
        <Link
          href={detailHref}
          className="flex min-w-0 items-center gap-1 text-sm font-extrabold text-[#4F3828] hover:underline"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#7B63A8]" />
          <span className="line-clamp-1">{title}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8b816f]" aria-hidden="true" />
        </Link>
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-semibold text-[#6A4D36]">
            <PosterAvatar publicUserId={posterPublicId} size={14} fallback={<UserRound className="h-3.5 w-3.5 shrink-0" />} />
            <span className="truncate">{posterName}</span>
            <PosterRegularBadge publicUserId={posterPublicId} size="icon" />
          </div>
          {/* スマホの2列だと名前と日付が1行に入らず名前が切れるので、日付は行を分ける */}
          <div className="mt-0.5 text-[11px] text-[#8b816f]">投稿 {formatDateJaJst(dm.created_at)}</div>
          {/* ひとことは切らずに全部出す（説明文は長くても 120 文字ほど。改行もそのまま） */}
          {dm.description && (
            <p className="mt-1.5 whitespace-pre-wrap break-words rounded-[6px] bg-[#F6EEDC] px-2 py-1 text-[11px] leading-snug text-[#4F3828]">
              {dm.description}
            </p>
          )}
        </Link>
      </div>
    </div>
  );
}
