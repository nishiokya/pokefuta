import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Camera, CheckCircle2, CircleDot, Compass, MapPin, Trophy } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PrefectureProgressShareButton from '@/components/users/PrefectureProgressShareButton';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL } from '@/lib/constants';
import {
  PublicPrefectureManhole,
  PublicPrefectureProgress,
  loadPublicUserPrefectureProgress,
} from '@/lib/user-prefecture-progress';

type PageProps = {
  params: {
    userId: string;
  };
  searchParams?: {
    prefecture?: string;
  };
};

export const dynamic = 'force-dynamic';

const getPageUrl = (userId: string) => `${SITE_URL}/users/${encodeURIComponent(userId)}/prefectures`;

const formatRate = (rate: number, digits = 1) => `${rate.toFixed(digits)}%`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const progress = await loadPublicUserPrefectureProgress(params.userId);

  if (!progress) {
    return {
      title: `都道府県達成状況が見つかりません | ${SITE_NAME}`,
    };
  }

  const pageUrl = getPageUrl(progress.userId);
  const title = `${progress.displayName}の都道府県達成状況 | ${SITE_NAME}`;
  const description = `${progress.completedPrefectureCount}/${progress.totalPrefectureCount}都道府県制覇、全国達成率${formatRate(progress.completionRate)}。ポケふた巡りの達成状況を公開中です。`;
  const imageUrl = `${pageUrl}/opengraph-image?v=${OGP_IMAGE_VERSION}`;

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: SITE_NAME,
      type: 'profile',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function UserPrefecturesPage({ params, searchParams }: PageProps) {
  const progress = await loadPublicUserPrefectureProgress(params.userId);

  if (!progress) notFound();

  const selectedPrefecture = searchParams?.prefecture;
  const selectedProgress = selectedPrefecture
    ? progress.prefectures.find((prefecture) => prefecture.name === selectedPrefecture)
    : null;
  const shareUrl = selectedPrefecture
    ? `${getPageUrl(progress.userId)}?prefecture=${encodeURIComponent(selectedPrefecture)}`
    : getPageUrl(progress.userId);

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <Header
        title={SITE_NAME}
        actions={
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#4F3828]">
            <ArrowLeft className="h-4 w-4" />
            ホームへ
          </Link>
        }
      />

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:pt-8">
        <section className="relative overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-5 py-6 shadow-[0_12px_30px_rgba(95,68,42,0.13)] sm:px-8 sm:py-8">
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#B5483C]/25 bg-[#F8D9C4] px-3 py-1 text-xs font-bold text-[#B5483C]">
              <Trophy className="h-3.5 w-3.5" />
              都道府県達成状況
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
                  {progress.displayName}のポケふた旅
                </h1>
                <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-[#6A4D36] sm:text-base">
                  公開中の訪問記録をもとにした、都道府県ごとの達成状況です。
                </p>
              </div>
              <PrefectureProgressShareButton
                displayName={progress.displayName}
                completedPrefectureCount={progress.completedPrefectureCount}
                totalPrefectureCount={progress.totalPrefectureCount}
                shareUrl={shareUrl}
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <HeroStat label="制覇都道府県" value={`${progress.completedPrefectureCount}/${progress.totalPrefectureCount}`} />
              <HeroStat label="公開訪問スタンプ" value={`${progress.visitedManholeCount}/${progress.totalManholeCount}`} />
              <HeroStat label="全国達成率" value={formatRate(progress.completionRate)} />
            </div>

            <div className="mt-5 h-4 overflow-hidden rounded-sm border border-[#8C6A4A]/20 bg-[#E4D4B8]">
              <div
                className="h-full bg-gradient-to-r from-[#8C6A4A] via-[#DDA63A] to-[#2C765E]"
                style={{ width: `${Math.min(progress.completionRate, 100)}%` }}
              />
            </div>
          </div>
        </section>

        {selectedProgress && (
          <section className="mt-5 rounded-[8px] border border-[#DDA63A]/35 bg-[#FFF8EB] p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-extrabold text-[#8C6A4A]">選択中の都道府県</p>
                <h2 className="mt-1 text-xl font-extrabold text-[#4F3828]">{selectedProgress.name}</h2>
              </div>
              <ProgressPill prefecture={selectedProgress} />
            </div>
          </section>
        )}

        {selectedProgress && (
          <section className="mt-5">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold text-[#8C6A4A]">県内のポケふた</p>
                <h2 className="text-xl font-extrabold text-[#4F3828]">
                  {selectedProgress.name}のマンホール一覧
                </h2>
              </div>
              <p className="text-sm font-bold text-[#6A4D36]">
                公開訪問 {selectedProgress.visited} / {selectedProgress.total}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectedProgress.manholes.map((manhole) => (
                <PrefectureManholeCard key={manhole.id} manhole={manhole} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {progress.prefectures.map((prefecture) => (
            <PrefectureProgressCard
              key={prefecture.name}
              prefecture={prefecture}
              highlighted={prefecture.name === selectedPrefecture}
              userId={progress.userId}
            />
          ))}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

function PrefectureManholeCard({ manhole }: { manhole: PublicPrefectureManhole }) {
  const photoUrl = manhole.latestPublicPhotoId
    ? `/api/photo/${encodeURIComponent(manhole.latestPublicPhotoId)}?size=small`
    : null;
  const pokemonLabel = manhole.pokemons.length > 0 ? manhole.pokemons.join('・') : 'ポケモン未設定';

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className="group overflow-hidden rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] shadow-sm transition hover:-translate-y-0.5 hover:border-[#DDA63A] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#DDA63A]/50"
    >
      <div className="aspect-[4/3] bg-[#E4D4B8]">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${manhole.title}の訪問写真`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-[#8C6A4A]">
            <Camera className="h-8 w-8" />
            <span className="text-xs font-extrabold">公開写真なし</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-xs font-extrabold ${
              manhole.visited
                ? 'bg-[#E6F4DD] text-[#2C765E]'
                : 'bg-[#F8D9C4] text-[#B5483C]'
            }`}
          >
            {manhole.visited ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Compass className="h-3.5 w-3.5" />}
            {manhole.visited ? '訪問済み' : '未訪問'}
          </span>
          <span className="font-pixel text-xs text-[#8C6A4A]">#{manhole.id}</span>
        </div>
        <h3 className="line-clamp-2 min-h-[3rem] text-base font-extrabold leading-6 text-[#4F3828]">
          {manhole.title}
        </h3>
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-[#6A4D36]">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{manhole.municipality || manhole.prefecture}</span>
        </p>
        <p className="mt-2 line-clamp-1 text-xs font-bold text-[#B5483C]">{pokemonLabel}</p>
      </div>
    </Link>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-[#8C6A4A]/15 bg-white/70 px-4 py-3">
      <p className="text-[11px] font-extrabold text-[#6A4D36]">{label}</p>
      <p className="mt-1 font-pixel text-2xl leading-none text-[#B5483C]">{value}</p>
    </div>
  );
}

function ProgressPill({ prefecture }: { prefecture: PublicPrefectureProgress }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-[7px] px-3 py-2 text-sm font-extrabold ${
      prefecture.complete
        ? 'bg-[#E6F4DD] text-[#2C765E]'
        : 'bg-[#F8D9C4] text-[#B5483C]'
    }`}>
      {prefecture.complete ? <CheckCircle2 className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
      {prefecture.complete ? '制覇済み' : `あと${prefecture.remaining}枚`}
    </div>
  );
}

function PrefectureProgressCard({
  prefecture,
  highlighted,
  userId,
}: {
  prefecture: PublicPrefectureProgress;
  highlighted: boolean;
  userId: string;
}) {
  const href = highlighted
    ? `/users/${encodeURIComponent(userId)}/prefectures`
    : `?prefecture=${encodeURIComponent(prefecture.name)}`;

  return (
    <Link
      href={href}
      className={`block rounded-[8px] border bg-[#FFF7E5] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#DDA63A]/50 ${
        highlighted
          ? 'border-[#DDA63A] ring-2 ring-[#DDA63A]/30'
          : 'border-[#8C6A4A]/15'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold text-[#4F3828]">{prefecture.name}</h2>
          <p className="mt-1 font-pixel text-lg leading-none text-[#B5483C]">
            {prefecture.visited} / {prefecture.total}
          </p>
        </div>
        <ProgressPill prefecture={prefecture} />
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-sm border border-[#8C6A4A]/15 bg-[#E4D4B8]">
        <div
          className={`h-full ${prefecture.complete ? 'bg-[#2C765E]' : 'bg-[#8C6A4A]'}`}
          style={{ width: `${Math.min(prefecture.rate, 100)}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-bold text-[#6A4D36]">
        <span className="inline-flex items-center gap-1">
          <CircleDot className="h-3.5 w-3.5" />
          公開訪問ベース
        </span>
        <span>{formatRate(prefecture.rate, 0)}</span>
      </div>
    </Link>
  );
}
