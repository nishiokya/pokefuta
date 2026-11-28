import Link from 'next/link';
import { formatDateJaJst } from '@/lib/date';
import { OWN_DESIGN_MANHOLE_STATUS_LABEL, type OwnDesignManhole } from '@/lib/own-design-manholes';

/**
 * 自分の投稿の一覧（/visits/design-manholes）のカード。DesignManholeCard の本人向けの軽い版。
 * 投稿者名・アバターは出さない。状態ラベル（確認待ち・移した）は写真の左上に重ねる。
 * href が null（確認待ち）のカードはリンクにしない。
 */
export default function OwnDesignManholeCard({ item, eager }: { item: OwnDesignManhole; eager: boolean }) {
  const title = item.title || 'デザインマンホール';
  const label = OWN_DESIGN_MANHOLE_STATUS_LABEL[item.status];

  const photo = (
    <div className="relative aspect-square overflow-hidden bg-[#EFE4CC]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.photo_url}
        alt=""
        width={400}
        height={400}
        loading={eager ? 'eager' : 'lazy'}
        className="h-full w-full object-cover"
      />
    </div>
  );

  return (
    <div className="overflow-hidden rounded-[10px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15">
      <div className="relative">
        {item.href ? (
          <Link
            href={item.href}
            aria-label={[title, label, `投稿 ${formatDateJaJst(item.created_at)}`].filter(Boolean).join('、')}
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB347]"
          >
            {photo}
          </Link>
        ) : (
          photo
        )}
        {label && (
          <span className="pointer-events-none absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] rounded-full bg-dm-line px-2 py-0.5 text-[11px] font-bold text-white shadow-sm ring-1 ring-white/70">
            {label}
          </span>
        )}
      </div>
      <div className="px-2.5 py-2 sm:px-3">
        <div className="line-clamp-1 text-sm font-extrabold text-[#4F3828]">{title}</div>
        <div className="mt-0.5 text-[11px] text-[#8b816f]">投稿 {formatDateJaJst(item.created_at)}</div>
        {item.description && (
          <p className="mt-1.5 whitespace-pre-wrap break-words rounded-[6px] bg-[#F6EEDC] px-2 py-1 text-[11px] leading-snug text-[#4F3828]">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}
