import Link from 'next/link';
import { tagHref, type TagChip } from '@/lib/design-manhole-tag-data';

const CHIP_CLASS =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1 pr-3 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB347]';
const IDLE_CLASS = 'bg-white text-dm-line ring-1 ring-dm-line/30 hover:bg-[#F3EEFA]';
const CURRENT_CLASS = 'bg-dm-line text-white';

// スマホでこの数を超えたら2段にする（1段だと横に長すぎて奥のタグまで指が届かない）
const TWO_ROWS_FROM = 7;

/** チップのおおよその幅（写真・余白・枚数＋ラベルの文字数）。2段の長さをそろえるのに使う */
function chipWidth(label: string): number {
  return 64 + label.length * 14;
}

/** 前から詰めて、1段目の幅が全体の半分を超えたところで2段目へ（PC では2つの段をつなげて並べるので順は変わらない） */
function splitRows<T>(items: T[], width: (item: T) => number): [T[], T[]] {
  const total = items.reduce((sum, item) => sum + width(item), 0);
  let acc = 0;
  let cut = items.length;
  for (let i = 0; i < items.length; i += 1) {
    if (acc >= total / 2) {
      cut = i;
      break;
    }
    acc += width(items[i]);
  }
  return [items.slice(0, cut), items.slice(cut)];
}

type Item = { key: string; href: string; label: string; count: number; coverId: string | null; isCurrent: boolean; plain: boolean };

function ChipItem({ item }: { item: Item }) {
  return (
    <li className="shrink-0">
      <Link
        href={item.href}
        aria-current={item.isCurrent ? 'page' : undefined}
        className={`${CHIP_CLASS} ${item.plain ? 'h-9 pl-3' : ''} ${item.isCurrent ? CURRENT_CLASS : IDLE_CLASS}`}
      >
        {item.plain ? null : item.coverId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/design-manholes/${item.coverId}/photo?size=small`}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            className="h-7 w-7 rounded-full bg-[#EFE4CC] object-cover"
          />
        ) : (
          <span className="h-7 w-0" aria-hidden="true" />
        )}
        {item.label}
        <span className="text-xs font-semibold opacity-75">{item.count}</span>
      </Link>
    </li>
  );
}

/**
 * デザインマンホールのタグのチップ（ガンダム 29 / 野球 3 …）。丸い写真はそのタグのいちばん新しい投稿。
 * スマホは横にスクロールする帯（数が多ければ2段）、sm 以上は折り返す。
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
  const items: Item[] = [
    ...(all !== undefined
      ? [{ key: '__all', href: '/design-manholes', label: 'すべて', count: all, coverId: null, isCurrent: current === undefined, plain: true }]
      : []),
    ...chips.map(({ group, photos, coverId }) => ({
      key: group.slug,
      href: tagHref(group.slug),
      label: group.label,
      count: photos,
      coverId,
      isCurrent: group.slug === current,
      plain: false,
    })),
  ];
  const rows = items.length >= TWO_ROWS_FROM ? splitRows(items, (item) => chipWidth(item.label)) : [items];
  return (
    <nav
      aria-label={label}
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {/* スマホは段ごとに横へ並べて一緒にスクロール。sm 以上は段の ul を contents にして1つの折り返しにする */}
      <div className="flex w-max flex-col gap-2 py-1 sm:w-auto sm:flex-row sm:flex-wrap">
        {rows.map((row) => (
          <ul key={row[0]?.key ?? 'empty'} className="flex gap-2 sm:contents">
            {row.map((item) => (
              <ChipItem key={item.key} item={item} />
            ))}
          </ul>
        ))}
      </div>
    </nav>
  );
}
