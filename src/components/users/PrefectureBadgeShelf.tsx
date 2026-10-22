import Link from 'next/link';
import { Award, Lock, RotateCcw, Trophy } from 'lucide-react';
import { formatDateJaJst } from '@/lib/date';
import { newUnvisitedSinceEarned } from '@/lib/prefecture-new-manholes';
import type { PublicPrefectureProgress } from '@/lib/user-prefecture-progress';

type PrefectureBadgeShelfProps = {
  userId: string;
  prefectures: PublicPrefectureProgress[];
  totalPrefectureCount: number;
};

// リーチ扱いにする残り枚数。ポケふたは23県が5枚以下なので3枚あれば十分に届く距離
const NEAR_COMPLETE_THRESHOLD = 3;
const NEAR_COMPLETE_LIMIT = 6;
// 制覇がこの数以上の人は、カードをやめて小さいチップで並べる。
// 小さいカードにしても35県だとスマホで9段になり、写真までが遠いため
const COMPACT_EARNED_THRESHOLD = 10;

// 「2026年5月15日」→「2026/5/15」
const shortDate = (label: string) => label.replace(/[年月]/g, '/').replace('日', '');

const badgeUrl = (userId: string, prefectureName: string) =>
  `/users/${encodeURIComponent(userId)}/prefectures/${encodeURIComponent(prefectureName)}`;

export default function PrefectureBadgeShelf({
  userId,
  prefectures,
  totalPrefectureCount,
}: PrefectureBadgeShelfProps) {
  // 獲得済みバッジは剥奪しない。制覇後にポケふたが新設された県も棚に残す
  const earned = prefectures.filter((prefecture) => prefecture.earnedAt);
  const nearComplete = prefectures
    .filter(
      (prefecture) =>
        !prefecture.earnedAt &&
        prefecture.visited > 0 &&
        prefecture.remaining <= NEAR_COMPLETE_THRESHOLD
    )
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, NEAR_COMPLETE_LIMIT);

  // 制覇したあとに新しいポケふたが増え、まだ訪問していない県。バッジは残したまま
  // 「また行く理由」として別の段に出す。新設はニュースになるので、ここが一番動きのある段になる
  const rechallenge = earned
    .filter((prefecture) => newUnvisitedSinceEarned(prefecture) > 0)
    .sort((a, b) => newUnvisitedSinceEarned(a) - newUnvisitedSinceEarned(b));

  // リーチ候補が無いときだけ、一番進んでいる県を「次の目標」に使う
  const nextTarget = prefectures.find(
    (prefecture) => !prefecture.earnedAt && prefecture.visited > 0
  );

  // バッジが大きいと棚が縦に長くなりすぎる（35県で PC 約1500px、スマホはその倍）ので、小さくして列を増やす
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
          <Trophy className="h-5 w-5 text-[#B5483C]" />
          制覇した都道府県
        </h2>
        <p className="font-pixel text-sm text-[#B5483C]">
          {earned.length}
          <span className="text-[#8C6A4A]">/{totalPrefectureCount}</span>
        </p>
      </div>

      {earned.length >= COMPACT_EARNED_THRESHOLD ? (
        <CompactEarnedList userId={userId} earned={earned} />
      ) : earned.length > 0 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {earned.map((prefecture) => (
            <EarnedBadge key={prefecture.name} userId={userId} prefecture={prefecture} />
          ))}
        </div>
      ) : (
        // 「最初のバッジ」の候補なので、残り枚数が最小のリーチ県を優先する
        <EmptyShelf target={nearComplete[0] ?? nextTarget ?? null} />
      )}

      {rechallenge.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 flex items-center gap-1.5 font-pixelJp text-sm font-bold text-[#4F3828]">
            <RotateCcw className="h-4 w-4 text-[#B5483C]" />
            新しいポケふたが増えました
          </h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {rechallenge.map((prefecture) => (
              <RechallengeBadge key={prefecture.name} userId={userId} prefecture={prefecture} />
            ))}
          </div>
        </>
      )}

      {nearComplete.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 font-pixelJp text-sm font-bold text-[#4F3828]">
            あと少しでバッジ
          </h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {nearComplete.map((prefecture) => (
              <NearCompleteBadge key={prefecture.name} userId={userId} prefecture={prefecture} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EarnedBadge({
  userId,
  prefecture,
}: {
  userId: string;
  prefecture: PublicPrefectureProgress;
}) {
  // 制覇後に増えて、まだ訪問していない枚数。バッジは残し、角のリボンで「また行ける」を知らせる
  const newUnvisited = newUnvisitedSinceEarned(prefecture);

  return (
    <Link
      href={badgeUrl(userId, prefecture.name)}
      className="group relative flex flex-col items-center rounded-[10px] border-2 border-[#C9992F] bg-gradient-to-b from-[#FFF3D0] to-[#F7E2AE] px-2 py-2.5 text-center shadow-[0_6px_16px_rgba(160,120,40,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(160,120,40,0.3)]"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#C9992F] bg-[#FFFBEE] text-[#B5483C] shadow-inner">
        <Award className="h-4 w-4" />
      </div>
      <p className="mt-1 font-pixelJp text-xs font-bold leading-tight text-[#4F3828] sm:text-sm">
        {prefecture.name}
      </p>
      <p className="mt-1 font-pixel text-base leading-none text-[#B5483C]">
        {prefecture.earnedTotal}/{prefecture.earnedTotal}
      </p>
      <p className="mt-1.5 whitespace-nowrap rounded-full bg-[#C9992F]/15 px-1.5 sm:px-2 py-0.5 font-pixelJp text-[10px] font-bold text-[#8A6A1E]">
        {/* スマホの4列でも1行に収まるよう数字だけの日付にする。制覇の意味は棚の見出しが持つ */}
        {prefecture.earnedAt ? shortDate(formatDateJaJst(prefecture.earnedAt)) : '制覇済み'}
      </p>
      {newUnvisited > 0 && (
        <span className="absolute -right-1.5 -top-2 rotate-6 rounded-full bg-[#B5483C] px-2 py-0.5 font-pixel text-[11px] font-bold leading-none text-white shadow-md">
          +{newUnvisited} NEW
        </span>
      )}
    </Link>
  );
}

/**
 * チップは制覇したときの枚数（earnedTotal）の多い順。棚の元の並びは今の達成率と訪問数なので、
 * 制覇後に新しいポケふたが増えた大きい県が後ろへ回ってしまう
 */
export function sortEarnedForChips<T extends Pick<PublicPrefectureProgress, 'name' | 'earnedTotal'>>(earned: T[]): T[] {
  return [...earned].sort((a, b) => b.earnedTotal - a.earnedTotal || a.name.localeCompare(b.name, 'ja'));
}

// チップなら40県あっても数行に収まるので、全部出す
function CompactEarnedList({ userId, earned }: { userId: string; earned: PublicPrefectureProgress[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sortEarnedForChips(earned).map((prefecture) => (
        <EarnedChip key={prefecture.name} userId={userId} prefecture={prefecture} />
      ))}
    </div>
  );
}

function EarnedChip({ userId, prefecture }: { userId: string; prefecture: PublicPrefectureProgress }) {
  const newUnvisited = newUnvisitedSinceEarned(prefecture);
  const label = `${prefecture.name} ${prefecture.earnedTotal}枚 制覇${
    prefecture.earnedAt ? `（${formatDateJaJst(prefecture.earnedAt)}）` : ''
  }`;
  return (
    <Link
      href={badgeUrl(userId, prefecture.name)}
      title={label}
      aria-label={newUnvisited > 0 ? `${label}、新しいポケふた あと${newUnvisited}枚` : label}
      className="inline-flex items-center gap-1 rounded-full border border-[#C9992F] bg-gradient-to-b from-[#FFF3D0] to-[#F7E2AE] py-1 pl-1.5 pr-2.5 font-pixelJp text-xs font-bold text-[#4F3828] shadow-[0_1px_3px_rgba(160,120,40,0.2)] transition hover:-translate-y-px"
    >
      <Award className="h-3.5 w-3.5 text-[#B5483C]" />
      {prefecture.name.replace(/[都府県]$/, '')}
      <span className="font-pixel text-[11px] text-[#B5483C]">{prefecture.earnedTotal}</span>
      {newUnvisited > 0 && (
        <span className="rounded-full bg-[#B5483C] px-1.5 py-px font-pixel text-[10px] leading-none text-white">
          +{newUnvisited}
        </span>
      )}
    </Link>
  );
}

function RechallengeBadge({
  userId,
  prefecture,
}: {
  userId: string;
  prefecture: PublicPrefectureProgress;
}) {
  return (
    <Link
      href={badgeUrl(userId, prefecture.name)}
      className="group flex flex-col items-center rounded-[10px] border-2 border-[#B5483C]/60 bg-gradient-to-b from-[#FFF3D0] to-[#F8D9C4] px-2 py-2.5 text-center shadow-[0_6px_16px_rgba(181,72,60,0.18)] transition hover:-translate-y-0.5"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#C9992F] bg-[#FFFBEE] text-[#B5483C] shadow-inner">
        <Award className="h-4 w-4" />
      </div>
      <p className="mt-1 font-pixelJp text-xs font-bold leading-tight text-[#4F3828] sm:text-sm">
        {prefecture.name}
      </p>
      <p className="mt-1 font-pixel text-base leading-none text-[#B5483C]">
        {prefecture.visited}/{prefecture.total}
      </p>
      <p className="mt-1.5 whitespace-nowrap rounded-full bg-[#B5483C] px-2 py-0.5 font-pixelJp text-[10px] font-bold text-white">
        {/* 4列に収まるよう「新しいふた」は段の見出しに任せる */}
        あと{newUnvisitedSinceEarned(prefecture)}枚
      </p>
    </Link>
  );
}

function NearCompleteBadge({
  userId,
  prefecture,
}: {
  userId: string;
  prefecture: PublicPrefectureProgress;
}) {
  return (
    <Link
      href={badgeUrl(userId, prefecture.name)}
      className="group flex flex-col items-center rounded-[10px] border-2 border-dashed border-[#8C6A4A]/45 bg-white/60 px-2 py-2.5 text-center transition hover:border-[#B5483C]/50 hover:bg-[#F8D9C4]/50"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-[#8C6A4A]/45 text-[#8C6A4A]">
        <Lock className="h-4 w-4" />
      </div>
      <p className="mt-1 font-pixelJp text-xs font-bold leading-tight text-[#4F3828] sm:text-sm">
        {prefecture.name}
      </p>
      <p className="mt-1 font-pixel text-base leading-none text-[#8C6A4A]">
        {prefecture.visited}/{prefecture.total}
      </p>
      <p className="mt-1.5 whitespace-nowrap rounded-full bg-[#B5483C]/10 px-2 py-0.5 font-pixelJp text-[10px] font-bold text-[#B5483C]">
        あと{prefecture.remaining}枚
      </p>
    </Link>
  );
}

// 棚が空でも「置き場所がある」ことを見せたいので、空スロットとして描く
function EmptyShelf({ target }: { target: PublicPrefectureProgress | null }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border-2 border-dashed border-[#8C6A4A]/35 bg-white/50 px-5 py-6 text-center sm:flex-row sm:justify-center sm:gap-5">
      <div className="flex gap-2">
        {[0, 1, 2].map((slot) => (
          <div
            key={slot}
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-[#8C6A4A]/30 text-[#8C6A4A]/50"
          >
            <Award className="h-5 w-5" />
          </div>
        ))}
      </div>
      <p className="font-pixelJp text-xs font-bold leading-relaxed text-[#6A4D36]">
        {target
          ? `${target.name}をあと${target.remaining}枚で最初のバッジ`
          : 'ポケふたを記録して最初のバッジを手に入れよう'}
      </p>
    </div>
  );
}
