import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const LINK_CLASS =
  'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full px-3 text-sm font-bold transition';
const IDLE_CLASS = 'bg-white text-dm-line ring-1 ring-dm-line/30 hover:bg-[#F3EEFA]';

/** ?page=N（1始まり）。数字でないものは null（404 にする） */
export function parseListPage(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!/^[1-9][0-9]{0,3}$/.test(value)) return null;
  return Number(value);
}

/** デザインマンホールの一覧・タグのページのページ送り。飛び先は一覧の先頭（#list） */
export default function ListPager({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <nav aria-label="ページ送り" className="mt-6 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={`${hrefFor(page - 1)}#list`} rel="prev" className={`${LINK_CLASS} ${IDLE_CLASS}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          前へ
        </Link>
      ) : null}
      {pages.map((n) =>
        n === page ? (
          <span key={n} aria-current="page" className={`${LINK_CLASS} bg-dm-line text-white`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={`${hrefFor(n)}#list`} className={`${LINK_CLASS} ${IDLE_CLASS}`}>
            {n}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={`${hrefFor(page + 1)}#list`} rel="next" className={`${LINK_CLASS} ${IDLE_CLASS}`}>
          次へ
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
