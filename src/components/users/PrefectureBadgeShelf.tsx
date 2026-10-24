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
// 棚の列数。スマホ6列・PC 12列まで。以前は10県以上でチップにまとめていたが（#350）、
// 県ごとのメダルが見えなくなるので、2026-10-24 にバッジそのものを小さくして全員同じ形にした
const SHELF_GRID = 'grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12';

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

/** 「2026年5月15日」→「26/05」。小さいバッジに収まるよう年月だけにする */
export function yearMonthLabel(label: string): string {
  const match = label.match(/(\d{4})年(\d{1,2})月/);
  return match ? `${match[1].slice(2)}/${match[2].padStart(2, '0')}` : label;
}

const shortName = (name: string) => (name === '北海道' ? name : name.replace(/[都府県]$/, ''));

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
          <Link href="/badges" className="font-pixelJp text-xs font-bold">トレーナーカードとは ›</Link>
        </p>
      </div>

      {earned.length > 0 ? (
        <>
          <div className={SHELF_GRID}>
            {sortEarnedForChips(earned).map((prefecture) => (
              <EarnedBadge key={prefecture.name} userId={userId} prefecture={prefecture} />
            ))}
          </div>
          <p className="mt-2 font-pixelJp text-[10px] text-[#8C6A4A]">
            メダルの色は県のポケふたの枚数（金 20枚以上・銀 5枚以上・銅 4枚以下）。数字は制覇したときの枚数、下は制覇した年月
          </p>
        </>
      ) : (
        // 「最初のバッジ」の候補なので、残り枚数が最小のリーチ県を優先する
        <EmptyShelf target={nearComplete[0] ?? nextTarget ?? null} />
      )}

      {rechallenge.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 flex items-center gap-1.5 font-pixelJp text-sm font-bold text-[#4F3828]">
            <RotateCcw className="h-4 w-4 text-[#B5483C]" />
            新しいポケふたが増えました
          </h3>
          <div className={SHELF_GRID}>
            {rechallenge.map((prefecture) => (
              <ProgressBadge key={prefecture.name} userId={userId} prefecture={prefecture} kind="rechallenge" />
            ))}
          </div>
        </>
      )}

      {nearComplete.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 font-pixelJp text-sm font-bold text-[#4F3828]">あと少しでバッジ</h3>
          <div className={SHELF_GRID}>
            {nearComplete.map((prefecture) => (
              <ProgressBadge key={prefecture.name} userId={userId} prefecture={prefecture} kind="near" />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * 制覇したバッジは、制覇したときの枚数（earnedTotal）の多い順（金・銀・銅の順に並ぶ）。棚の元の並びは今の達成率と
 * 訪問数なので、制覇後に新しいポケふたが増えた大きい県が後ろへ回ってしまう
 */
export function sortEarnedForChips<T extends Pick<PublicPrefectureProgress, 'name' | 'earnedTotal'>>(earned: T[]): T[] {
  return [...earned].sort((a, b) => b.earnedTotal - a.earnedTotal || a.name.localeCompare(b.name, 'ja'));
}

/**
 * 制覇したバッジ。メダルの色（金銀銅）と、制覇したときの枚数・年月だけを小さく。
 * 制覇後に増えて、まだ訪問していない枚数は角の「+N」で知らせる（バッジは残す）
 */
function EarnedBadge({ userId, prefecture }: { userId: string; prefecture: PublicPrefectureProgress }) {
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
      className={`relative flex min-w-0 flex-col items-center rounded-[8px] border bg-gradient-to-b px-0.5 py-1.5 text-center transition hover:-translate-y-0.5 ${style.chip}`}
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br font-pixel text-[10px] font-bold text-white shadow-[inset_0_-1px_2px_rgba(0,0,0,0.25)] ring-1 ring-white/80 ${style.medal}`}>
        {prefecture.earnedTotal}
      </span>
      <span className="mt-0.5 w-full truncate font-pixelJp text-[10px] font-bold leading-tight text-[#4F3828]">
        {shortName(prefecture.name)}
      </span>
      <span className="font-pixel text-[9px] leading-none text-[#8C6A4A]">
        {prefecture.earnedAt ? yearMonthLabel(formatDateJaJst(prefecture.earnedAt)) : '制覇'}
      </span>
      {newUnvisited > 0 && (
        <span className="absolute -right-1 -top-1.5 rounded-full bg-[#B5483C] px-1 py-px font-pixel text-[9px] font-bold leading-none text-white shadow">
          +{newUnvisited}
        </span>
      )}
    </Link>
  );
}

/** まだ取っていない段（あと少し・新設で再挑戦）。制覇と同じ大きさで、鍵（リーチ）か赤い札（再挑戦） */
function ProgressBadge({
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
      className={`flex min-w-0 flex-col items-center rounded-[8px] border px-0.5 py-1.5 text-center transition hover:-translate-y-0.5 ${
        kind === 'near'
          ? 'border-dashed border-[#8C6A4A]/45 bg-white/60'
          : 'border-[#B5483C]/50 bg-gradient-to-b from-[#FFF3D0] to-[#F8D9C4]'
      }`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full ${
          kind === 'near' ? 'border border-dashed border-[#8C6A4A]/50 text-[#8C6A4A]' : 'bg-[#B5483C] text-white'
        }`}
      >
        {kind === 'near' ? <Lock className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
      </span>
      <span className="mt-0.5 w-full truncate font-pixelJp text-[10px] font-bold leading-tight text-[#4F3828]">
        {shortName(prefecture.name)}
      </span>
      <span className="font-pixelJp text-[9px] font-bold leading-none text-[#B5483C]">あと{remaining}</span>
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
