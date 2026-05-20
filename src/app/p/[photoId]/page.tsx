import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Camera, MapPin, Sparkles } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { formatDateJa } from '@/lib/date';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import {
  getManholeLocationLabel,
  getSortedTitles,
  loadPublicSharedPhoto,
} from '@/lib/shared-photo';

type PageProps = {
  params: {
    photoId: string;
  };
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const photo = await loadPublicSharedPhoto(params.photoId);

  if (!photo) {
    return {
      title: `写真が見つかりません | ${SITE_NAME}`,
    };
  }

  const locationLabel = getManholeLocationLabel(photo.manhole);
  const pokemonText = photo.manhole.pokemons.length > 0
    ? `｜${photo.manhole.pokemons.join('・')}`
    : '';
  const title = `${locationLabel}のポケふた写真${pokemonText} | ${SITE_NAME}`;
  const description = photo.visit.comment
    ? photo.visit.comment
    : `${locationLabel}で見つけたポケふた写真です。`;
  const pageUrl = `${SITE_URL}/p/${photo.id}`;
  const imageUrl = `${pageUrl}/opengraph-image`;

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
      type: 'article',
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

export default async function SharedPhotoPage({ params }: PageProps) {
  const photo = await loadPublicSharedPhoto(params.photoId);

  if (!photo) notFound();

  const titles = getSortedTitles(photo.manhole.titles);
  const locationLabel = getManholeLocationLabel(photo.manhole);

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <header className="sticky top-0 z-50 border-b border-[#7B63A8]/20 bg-[#FFF8EB]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href={`/manhole/${photo.manhole.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-[#4F3828]">
            <ArrowLeft className="h-4 w-4" />
            マンホール詳細へ
          </Link>
          <Link href="/" className="text-sm font-extrabold text-[#7B63A8]">
            {SITE_NAME}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
        <article className="overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF8EB] shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
          <div className="relative bg-[#E9DEC9]">
            <img
              src={`/api/photo/${photo.id}?size=small`}
              alt={`${locationLabel}のポケふた写真`}
              className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 text-white sm:p-6">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <MapPin className="h-4 w-4" />
                {photo.manhole.prefecture} / {photo.manhole.municipality || '場所未設定'}
              </div>
              <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">
                {locationLabel}のポケふた
              </h1>
              {photo.manhole.pokemons.length > 0 && (
                <p className="mt-2 text-sm font-bold text-white/90 sm:text-base">
                  {photo.manhole.pokemons.join('・')}が描かれたポケモンマンホール
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            {titles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {titles.map((title) => (
                  <span
                    key={title.key}
                    className="inline-flex items-center gap-1 rounded-full border border-[#D94D3F]/30 bg-[#F8D9C4] px-3 py-1.5 text-xs font-extrabold text-[#B5483C]"
                  >
                    {title.emoji || <Sparkles className="h-3 w-3" />}
                    {title.label}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 rounded-[8px] border border-[#8C6A4A]/15 bg-white/70 px-3 py-2 text-sm font-bold text-[#4F3828]">
              <Camera className="h-4 w-4 text-[#B5483C]" />
              撮影日: {formatDateJa(photo.visit.shot_at)}
            </div>

            {photo.visit.comment && (
              <p className="whitespace-pre-wrap rounded-[8px] border border-[#8C6A4A]/15 bg-white/70 p-4 text-sm font-semibold leading-relaxed text-[#4F3828]">
                {photo.visit.comment}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/manhole/${photo.manhole.id}`}
                className="inline-flex items-center justify-center rounded-lg bg-[#7B63A8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
              >
                このポケふたを見る
              </Link>
              <Link
                href="/upload"
                className="inline-flex items-center justify-center rounded-lg border border-[#7B63A8] bg-white px-5 py-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
              >
                自分も記録する
              </Link>
            </div>
          </div>
        </article>
      </main>

      <BottomNav />
    </div>
  );
}
