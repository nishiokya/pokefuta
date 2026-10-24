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

/**
 * チップのメダルの色。県のポケふたの枚数（制覇したときの枚数）で金・銀・銅に分ける。
 * 同じ色のチップが40個並ぶと単調で、大きな県を制覇した重みも見えなかった。
 * 20枚以上は6県・5〜19枚は約20県で、残りの小さな県が銅になる
 */
export type MedalTier = 'gold' | 'silver' | 'bronze';
export function medalTier(earnedTotal: number): MedalTier {
  if (earnedTotal >= 20) return 'gold';
  if (earnedTotal >= 5) return 'silver';
  return 'bronze';
}

export const MEDAL_STYLES: Record<MedalTier, { chip: string; medal: string; count: string }> = {
  gold: {
    chip: 'border-[#C9992F] from-[#FFF3D0] to-[#F2D891] shadow-[0_2px_6px_rgba(160,120,40,0.35)]',
    medal: 'from-[#FBE38E] via-[#E5B83E] to-[#B8862A]',
    count: 'bg-[#B8862A] text-white',
  },
  silver: {
    chip: 'border-[#A9B4BF] from-[#FBFCFD] to-[#E1E7ED] shadow-[0_2px_5px_rgba(90,105,120,0.25)]',
    medal: 'from-[#F4F7FA] via-[#C3CCD5] to-[#8C98A4]',
    count: 'bg-[#7F8B97] text-white',
  },
  bronze: {
    chip: 'border-[#C88A5E] from-[#FFF4EA] to-[#F0D3BC] shadow-[0_2px_5px_rgba(150,90,50,0.25)]',
    medal: 'from-[#F6CDA8] via-[#D08E5C] to-[#A5643A]',
    count: 'bg-[#A5643A] text-white',
  },
};

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

  const compact = earned.length >= COMPACT_EARNED_THRESHOLD;

  // バッジが大きいと棚が縦に長くなりすぎる（35県で PC 約1500px、スマホはその倍）ので、小さくして列を増やす
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
          <Trophy className="h-5 w-5 text-[#B5483C]" />
          制覇した都道府県
        </h2>
        <p className="flex items-baseline gap-3 font-pixel text-sm text-[#B5483C]">
          <span>
            {earned.length}
            <span className="text-[#8C6A4A]">/{totalPrefectureCount}</span>
          </span>
          <Link href="/badges" className="font-pixelJp text-xs font-bold">バッジとは ›</Link>
        </p>
      </div>

      {compact ? (
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

      {/* 制覇がチップのときは下の段もチップにする。カードのままだと、まだ取っていないリーチの方が大きく見えて主役が逆になる */}
      {rechallenge.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 flex items-center gap-1.5 font-pixelJp text-sm font-bold text-[#4F3828]">
            <RotateCcw className="h-4 w-4 text-[#B5483C]" />
            新しいポケふたが増えました
          </h3>
          {compact ? (
            <div className="flex flex-wrap gap-1.5">
              {rechallenge.map((prefecture) => (
                <ProgressChip key={prefecture.name} userId={userId} prefecture={prefecture} kind="rechallenge" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {rechallenge.map((prefecture) => (
                <RechallengeBadge key={prefecture.name} userId={userId} prefecture={prefecture} />
              ))}
            </div>
          )}
        </>
      )}

      {nearComplete.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 font-pixelJp text-sm font-bold text-[#4F3828]">
            あと少しでバッジ
          </h3>
          {compact ? (
            <div className="flex flex-wrap gap-1.5">
              {nearComplete.map((prefecture) => (
                <ProgressChip key={prefecture.name} userId={userId} prefecture={prefecture} kind="near" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {nearComplete.map((prefecture) => (
                <NearCompleteBadge key={prefecture.name} userId={userId} prefecture={prefecture} />
              ))}
            </div>
          )}
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
    <>
      <div className="flex flex-wrap gap-2">
        {sortEarnedForChips(earned).map((prefecture) => (
          <EarnedChip key={prefecture.name} userId={userId} prefecture={prefecture} />
        ))}
      </div>
      <p className="mt-2 font-pixelJp text-[10px] text-[#8C6A4A]">
        メダルの色は県のポケふたの枚数（金 20枚以上・銀 5枚以上・銅 4枚以下）
      </p>
    </>
  );
}

// リーチ・再挑戦のチップ。まだ取っていないので、メダルではなく点線の鍵（リーチ）か赤い札（再挑戦）
function ProgressChip({
  userId,
  prefecture,
  kind,
}: {
  userId: string;
  prefecture: PublicPrefectureProgress;
  kind: 'near' | 'rechallenge';
}) {
  const remaining = kind === 'near' ? prefecture.remaining : newUnvisitedSinceEarned(prefecture);
  return (
    <Link
      href={badgeUrl(userId, prefecture.name)}
      aria-label={`${prefecture.name} ${prefecture.visited}/${prefecture.total}、あと${remaining}枚`}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 py-0.5 pl-0.5 pr-1 font-pixelJp text-[13px] font-bold text-[#4F3828] transition hover:-translate-y-px ${
        kind === 'near'
          ? 'border-dashed border-[#8C6A4A]/45 bg-white/60'
          : 'border-[#B5483C]/60 bg-gradient-to-b from-[#FFF3D0] to-[#F8D9C4]'
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          kind === 'near'
            ? 'border-2 border-dashed border-[#8C6A4A]/45 text-[#8C6A4A]'
            : 'bg-[#B5483C] text-white'
        }`}
      >
        {kind === 'near' ? <Lock className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
      </span>
      {prefecture.name.replace(/[都府県]$/, '')}
      <span className="font-pixel text-[11px] text-[#8C6A4A]">
        {prefecture.visited}/{prefecture.total}
      </span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${kind === 'near' ? 'bg-[#B5483C]/10 text-[#B5483C]' : 'bg-[#B5483C] text-white'}`}>
        あと{remaining}
      </span>
    </Link>
  );
}

function EarnedChip({ userId, prefecture }: { userId: string; prefecture: PublicPrefectureProgress }) {
  const newUnvisited = newUnvisitedSinceEarned(prefecture);
  const style = MEDAL_STYLES[medalTier(prefecture.earnedTotal)];
  const label = `${prefecture.name} ${prefecture.earnedTotal}枚 制覇${
    prefecture.earnedAt ? `（${formatDateJaJst(prefecture.earnedAt)}）` : ''
  }`;
  return (
    <Link
      href={badgeUrl(userId, prefecture.name)}
      title={label}
      aria-label={newUnvisited > 0 ? `${label}、新しいポケふた あと${newUnvisited}枚` : label}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 bg-gradient-to-b py-0.5 pl-0.5 pr-1 font-pixelJp text-[13px] font-bold text-[#4F3828] transition hover:-translate-y-px ${style.chip}`}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-[inset_0_-1px_2px_rgba(0,0,0,0.25),0_1px_1px_rgba(0,0,0,0.15)] ring-1 ring-white/80 ${style.medal}`}>
        <Award className="h-3.5 w-3.5 drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]" />
      </span>
      {prefecture.name.replace(/[都府県]$/, '')}
      <span className={`rounded-full px-1.5 py-0.5 font-pixel text-[11px] leading-none ${style.count}`}>{prefecture.earnedTotal}</span>
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
