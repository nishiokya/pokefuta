import Link from 'next/link';
import { Award, Lock, Trophy } from 'lucide-react';
import { formatDateJaJst } from '@/lib/date';
import type { PublicPrefectureProgress } from '@/lib/user-prefecture-progress';

type PrefectureBadgeShelfProps = {
  userId: string;
  prefectures: PublicPrefectureProgress[];
  totalPrefectureCount: number;
};

// リーチ扱いにする残り枚数。ポケふたは23県が5枚以下なので3枚あれば十分に届く距離
const NEAR_COMPLETE_THRESHOLD = 3;
const NEAR_COMPLETE_LIMIT = 6;

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
        <p className="font-pixel text-sm text-[#B5483C]">
          {earned.length}
          <span className="text-[#8C6A4A]">/{totalPrefectureCount}</span>
        </p>
      </div>

      {earned.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {earned.map((prefecture) => (
            <EarnedBadge key={prefecture.name} userId={userId} prefecture={prefecture} />
          ))}
        </div>
      ) : (
        // 「最初のバッジ」の候補なので、残り枚数が最小のリーチ県を優先する
        <EmptyShelf target={nearComplete[0] ?? nextTarget ?? null} />
      )}

      {nearComplete.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 font-pixelJp text-sm font-bold text-[#4F3828]">
            あと少しでバッジ
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
  // 制覇後に増えた枚数。バッジは残したうえで、増えた事実だけ静かに伝える
  const addedSinceEarned = Math.max(prefecture.total - prefecture.earnedTotal, 0);

  return (
    <Link
      href={badgeUrl(userId, prefecture.name)}
      className="group relative flex flex-col items-center rounded-[10px] border-2 border-[#C9992F] bg-gradient-to-b from-[#FFF3D0] to-[#F7E2AE] px-3 py-4 text-center shadow-[0_6px_16px_rgba(160,120,40,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(160,120,40,0.3)]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#C9992F] bg-[#FFFBEE] text-[#B5483C] shadow-inner">
        <Award className="h-6 w-6" />
      </div>
      <p className="mt-2 font-pixelJp text-sm font-bold leading-tight text-[#4F3828]">
        {prefecture.name}
      </p>
      <p className="mt-1 font-pixel text-base leading-none text-[#B5483C]">
        {prefecture.earnedTotal}/{prefecture.earnedTotal}
      </p>
      <p className="mt-2 rounded-full bg-[#C9992F]/15 px-2 py-0.5 font-pixelJp text-[10px] font-bold text-[#8A6A1E]">
        {prefecture.earnedAt ? `${formatDateJaJst(prefecture.earnedAt)} 制覇` : '制覇済み'}
      </p>
      {addedSinceEarned > 0 && (
        <p className="mt-1 font-pixelJp text-[10px] font-bold text-[#8C6A4A]">
          その後{addedSinceEarned}枚 追加
        </p>
      )}
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
      className="group flex flex-col items-center rounded-[10px] border-2 border-dashed border-[#8C6A4A]/45 bg-white/60 px-3 py-4 text-center transition hover:border-[#B5483C]/50 hover:bg-[#F8D9C4]/50"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-[#8C6A4A]/45 text-[#8C6A4A]">
        <Lock className="h-5 w-5" />
      </div>
      <p className="mt-2 font-pixelJp text-sm font-bold leading-tight text-[#4F3828]">
        {prefecture.name}
      </p>
      <p className="mt-1 font-pixel text-base leading-none text-[#8C6A4A]">
        {prefecture.visited}/{prefecture.total}
      </p>
      <p className="mt-2 rounded-full bg-[#B5483C]/10 px-2 py-0.5 font-pixelJp text-[10px] font-bold text-[#B5483C]">
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
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-[#8C6A4A]/30 text-[#8C6A4A]/50"
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
