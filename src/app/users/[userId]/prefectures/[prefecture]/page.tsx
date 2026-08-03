import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Award, Camera, Lock, MapPin } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import ShareButtons from '@/components/ShareButtons';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL } from '@/lib/constants';
import { formatDateJaJst } from '@/lib/date';
import { prefectureBadgeShareText } from '@/lib/share';
import {
  PublicPrefectureManhole,
  PublicPrefectureProgress,
  loadPublicUserPrefectureProgress,
} from '@/lib/user-prefecture-progress';

type PageProps = {
  params: {
    userId: string;
    prefecture: string;
  };
};

export const dynamic = 'force-dynamic';

const getPageUrl = (userId: string, prefecture: string) =>
  `${SITE_URL}/users/${encodeURIComponent(userId)}/prefectures/${encodeURIComponent(prefecture)}`;

// params は Next.js が復号済みの値を渡すが、多重エンコードされた URL でも拾えるよう保険をかける
function decodePrefectureParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function loadBadge(userId: string, prefectureParam: string) {
  const progress = await loadPublicUserPrefectureProgress(userId).catch(() => null);
  if (!progress) return null;

  const name = decodePrefectureParam(prefectureParam);
  const prefecture = progress.prefectures.find((item) => item.name === name);
  if (!prefecture) return null;

  return { progress, prefecture };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const found = await loadBadge(params.userId, params.prefecture);

  if (!found) {
    return { title: `バッジが見つかりません | ${SITE_NAME}` };
  }

  const { progress, prefecture } = found;
  const pageUrl = getPageUrl(progress.userId, prefecture.name);
  const ogpImageUrl = `${pageUrl}/opengraph-image?v=${OGP_IMAGE_VERSION}`;
  const earned = Boolean(prefecture.earnedAt);
  const title = earned
    ? `${progress.displayName}の${prefecture.name}制覇バッジ | ${SITE_NAME}`
    : `${progress.displayName}の${prefecture.name}のポケふた | ${SITE_NAME}`;
  const description = earned
    ? `${progress.displayName}さんは${prefecture.name}のポケふた${prefecture.earnedTotal}枚をすべて制覇しました。`
    : `${progress.displayName}さんは${prefecture.name}のポケふたを${prefecture.visited}/${prefecture.total}枚記録中です。`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: SITE_NAME,
      type: 'profile',
      images: [
        {
          url: ogpImageUrl,
          width: 1200,
          height: 630,
          alt: `${progress.displayName}の${prefecture.name}バッジ`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogpImageUrl],
    },
  };
}

export default async function UserPrefectureBadgePage({ params }: PageProps) {
  const found = await loadBadge(params.userId, params.prefecture);
  if (!found) notFound();

  const { progress, prefecture } = found;
  const pageUrl = getPageUrl(progress.userId, prefecture.name);
  const stampBookUrl = `/users/${encodeURIComponent(progress.userId)}/visits`;
  const earned = Boolean(prefecture.earnedAt);
  const shareText = prefectureBadgeShareText(
    prefecture.name,
    prefecture.visited,
    earned ? prefecture.earnedTotal : prefecture.total,
    earned
  );
  const visitedManholes = prefecture.manholes.filter((manhole) => manhole.visited);
  const remainingManholes = prefecture.manholes.filter((manhole) => !manhole.visited);

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <Header
        title={SITE_NAME}
        actions={
          <Link
            href={stampBookUrl}
            className="inline-flex items-center gap-2 text-sm font-bold text-[#4F3828]"
          >
            <ArrowLeft className="h-4 w-4" />
            スタンプ帳へ
          </Link>
        }
      />

      <main className="mx-auto max-w-3xl px-4 pb-8 pt-5 sm:pt-8">
        <BadgeHero prefecture={prefecture} displayName={progress.displayName} />

        <div className="mt-6">
          <ShareButtons
            label={earned ? 'この制覇バッジを自慢する' : '進捗を共有する'}
            shareText={shareText}
            shareUrl={pageUrl}
            hashtags={['ポケふた制覇']}
          />
        </div>

        {visitedManholes.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
              <MapPin className="h-5 w-5 text-[#B5483C]" />
              訪問済み
              <span className="font-pixel text-sm text-[#B5483C]">{visitedManholes.length}</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visitedManholes.map((manhole) => (
                <ManholeTile key={manhole.id} manhole={manhole} />
              ))}
            </div>
          </section>
        )}

        {remainingManholes.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
              <Lock className="h-5 w-5 text-[#8C6A4A]" />
              未訪問
              <span className="font-pixel text-sm text-[#8C6A4A]">{remainingManholes.length}</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {remainingManholes.map((manhole) => (
                <ManholeTile key={manhole.id} manhole={manhole} />
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 text-center">
          <Link
            href={stampBookUrl}
            className="inline-flex items-center gap-2 rounded-[8px] border border-[#8C6A4A]/25 bg-[#FFF7E5] px-5 py-3 text-sm font-extrabold text-[#4F3828] shadow-sm transition hover:bg-[#F8D9C4]"
          >
            <ArrowLeft className="h-4 w-4" />
            {progress.displayName}のスタンプ帳を見る
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function BadgeHero({
  prefecture,
  displayName,
}: {
  prefecture: PublicPrefectureProgress;
  displayName: string;
}) {
  const barWidthPercent = prefecture.rate > 0 ? Math.max(prefecture.rate, 1.5) : 0;

  if (prefecture.earnedAt) {
    return (
      <section className="relative overflow-hidden rounded-[10px] border-2 border-[#C9992F] bg-gradient-to-b from-[#FFF6DA] to-[#F5DFA8] px-6 py-8 text-center shadow-[0_14px_34px_rgba(160,120,40,0.25)]">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#C9992F] bg-[#FFFBEE] text-[#B5483C] shadow-inner">
          <Award className="h-10 w-10" />
        </div>
        <p className="mt-4 inline-flex items-center rounded-full bg-[#C9992F]/20 px-3 py-1 font-pixelJp text-xs font-bold text-[#8A6A1E]">
          都道府県コンプリート
        </p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-[#4F3828] sm:text-4xl">
          {prefecture.name}制覇
        </h1>
        <p className="mt-2 font-pixel text-3xl leading-none text-[#B5483C]">
          {prefecture.earnedTotal}/{prefecture.earnedTotal}
        </p>
        {prefecture.total > prefecture.earnedTotal && (
          <p className="mt-1 font-pixelJp text-xs font-bold text-[#8C6A4A]">
            制覇後に{prefecture.total - prefecture.earnedTotal}枚 追加されました
          </p>
        )}
        <p className="mt-3 font-pixelJp text-sm font-bold text-[#6A4D36]">
          {displayName}
          {prefecture.earnedAt && ` ・ ${formatDateJaJst(prefecture.earnedAt)} 制覇`}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[10px] border border-[#8C6A4A]/25 bg-[#FFF7E5] px-6 py-7 shadow-sm">
      <p className="inline-flex items-center rounded-full bg-[#B5483C]/10 px-3 py-1 font-pixelJp text-xs font-bold text-[#B5483C]">
        あと{prefecture.remaining}枚でコンプリート
      </p>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight text-[#4F3828] sm:text-4xl">
        {prefecture.name}
      </h1>
      <p className="mt-2 font-pixel text-3xl leading-none text-[#B5483C]">
        {prefecture.visited}/{prefecture.total}
      </p>
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#8C6A4A]/20">
        <div
          className="h-full rounded-full bg-[#B5483C] transition-all"
          style={{ width: `${barWidthPercent}%` }}
        />
      </div>
      <p className="mt-3 font-pixelJp text-sm font-bold text-[#6A4D36]">{displayName}</p>
    </section>
  );
}

function ManholeTile({ manhole }: { manhole: PublicPrefectureManhole }) {
  const photoUrl = manhole.latestPublicPhotoId
    ? `/api/photo/${encodeURIComponent(manhole.latestPublicPhotoId)}?size=small`
    : null;

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className={`group flex aspect-[4/5] flex-col overflow-hidden rounded-[8px] border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        manhole.visited
          ? 'border-[#B5483C]/35 bg-[#FFF7E5]'
          : 'border-dashed border-[#8C6A4A]/30 bg-[#E9DEC9]/60'
      }`}
    >
      <div className="relative flex-1 overflow-hidden bg-[#E9DEC9]">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#8C6A4A]">
            {manhole.visited ? (
              <Camera className="h-7 w-7 opacity-60" />
            ) : (
              <Lock className="h-6 w-6 opacity-45" />
            )}
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate font-pixelJp text-[12px] font-bold leading-tight text-[#4F3828]">
          {manhole.title}
        </p>
        {manhole.municipality && (
          <p className="mt-0.5 truncate text-[11px] font-bold text-[#8C6A4A]">
            {manhole.municipality}
          </p>
        )}
      </div>
    </Link>
  );
}
