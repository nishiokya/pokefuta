import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Camera, MapPin, Stamp } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { formatDateJa } from '@/lib/date';
import { PublicVisit, loadPublicUserVisits } from '@/lib/user-public-visits';

type PageProps = {
  params: {
    userId: string;
  };
};

export const dynamic = 'force-dynamic';

const getPageUrl = (userId: string) => `${SITE_URL}/users/${encodeURIComponent(userId)}/visits`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await loadPublicUserVisits(params.userId);

  if (!data) {
    return {
      title: `スタンプ帳が見つかりません | ${SITE_NAME}`,
    };
  }

  const pageUrl = getPageUrl(data.userId);
  const title = `${data.displayName}のスタンプ帳 | ${SITE_NAME}`;
  const description = `${data.displayName}さんが公開している訪問記録${data.totalVisits}件、${data.prefectureCount}都道府県分のポケふたスタンプ帳です。`;

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
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function UserVisitsPage({ params }: PageProps) {
  const data = await loadPublicUserVisits(params.userId);

  if (!data) notFound();

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
              <Stamp className="h-3.5 w-3.5" />
              公開スタンプ帳
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
              {data.displayName}のスタンプ帳
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-[#6A4D36] sm:text-base">
              公開設定の訪問記録のみを表示しています。
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <HeroStat label="訪問数" value={`${data.totalVisits}`} />
              <HeroStat label="都道府県数" value={`${data.prefectureCount}`} />
            </div>
          </div>
        </section>

        <section className="mt-6">
          {data.visits.length === 0 ? (
            <div className="rounded-[8px] border border-[#8C6A4A]/15 bg-white/70 px-5 py-10 text-center text-sm font-bold text-[#6A4D36]">
              公開中の訪問記録はまだありません。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.visits.map((visit) => (
                <VisitCard key={visit.id} visit={visit} />
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
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

function VisitCard({ visit }: { visit: PublicVisit }) {
  const photoId = visit.photoIds[0] || null;
  const photoUrl = photoId ? `/api/photo/${encodeURIComponent(photoId)}?size=small` : null;
  const title = visit.manhole?.title
    || [visit.manhole?.prefecture, visit.manhole?.municipality].filter(Boolean).join(' ')
    || 'ポケふた';
  const locationLabel = [visit.manhole?.prefecture, visit.manhole?.municipality].filter(Boolean).join(' ');

  const card = (
    <div className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
            <Camera className="h-8 w-8 opacity-60" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate font-pixelJp text-[12px] font-bold leading-tight text-[#4F3828]">
          {title}
        </p>
        {locationLabel && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-bold text-[#8C6A4A]">
            <MapPin className="h-3 w-3 shrink-0" />
            {locationLabel}
          </p>
        )}
        {visit.shotAt && (
          <p className="mt-1 text-[11px] font-semibold text-[#6A4D36]">
            {formatDateJa(visit.shotAt)}
          </p>
        )}
        {visit.comment && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#6A4D36]">
            {visit.comment}
          </p>
        )}
      </div>
    </div>
  );

  if (!visit.manholeId) {
    return card;
  }

  return (
    <Link href={`/manhole/${visit.manholeId}`} className="block">
      {card}
    </Link>
  );
}
