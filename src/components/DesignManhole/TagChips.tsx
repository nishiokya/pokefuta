import Link from 'next/link';
import { tagHref, type TagChip } from '@/lib/design-manhole-tag-data';

const CHIP_CLASS =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1 pr-3 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB347]';
const IDLE_CLASS = 'bg-white text-dm-line ring-1 ring-dm-line/30 hover:bg-[#F3EEFA]';
const CURRENT_CLASS = 'bg-dm-line text-white';

/**
 * デザインマンホールのタグのチップ（ガンダム 29 / 野球 3 …）。丸い写真はそのタグのいちばん新しい投稿。
 * スマホは横にスクロールする1行、sm 以上は折り返す。チップは縮めない（縮むと文字が1字ずつ縦に折り返された）。
 *
 * @param all 「すべて」のチップを先頭に出すときの枚数（タグのページから一覧へ戻る入口にもなる）
 */
export default function TagChips({
  chips,
  current,
  all,
  label,
}: {
  chips: TagChip[];
  current?: string;
  all?: number;
  label: string;
}) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
      <ul className="flex gap-2 py-1 sm:flex-wrap">
        {all !== undefined && (
          <li className="shrink-0">
            <Link
              href="/design-manholes"
              aria-current={current === undefined ? 'page' : undefined}
              className={`${CHIP_CLASS} pl-3 ${current === undefined ? CURRENT_CLASS : IDLE_CLASS}`}
            >
              すべて
              <span className="text-xs font-semibold opacity-75">{all}</span>
            </Link>
          </li>
        )}
        {chips.map(({ group, photos, coverId }) => {
          const isCurrent = group.slug === current;
          return (
            <li key={group.slug} className="shrink-0">
              <Link
                href={tagHref(group.slug)}
                aria-current={isCurrent ? 'page' : undefined}
                className={`${CHIP_CLASS} ${isCurrent ? CURRENT_CLASS : IDLE_CLASS}`}
              >
                {coverId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/design-manholes/${coverId}/photo?size=small`}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    className="h-7 w-7 rounded-full bg-[#EFE4CC] object-cover"
                  />
                ) : (
                  <span className="h-7 w-0" aria-hidden="true" />
                )}
                {group.label}
                <span className="text-xs font-semibold opacity-75">{photos}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
