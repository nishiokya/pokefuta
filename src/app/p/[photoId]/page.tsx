import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, Camera, ChevronRight, Heart, Image as ImageIcon, MapPin, MessageCircle, Sparkles, UserRound } from 'lucide-react';
import Breadcrumb from '@/components/Breadcrumb';
import ShareButtons from '@/components/ShareButtons';
import PhotoDeleteButton from '@/components/PhotoDeleteButton';
import LandscapePhotoBadge from '@/components/LandscapePhotoBadge';
import AiPhotoTags from '@/components/AiPhotoTags';
import AiTagNote from '@/components/AiTagNote';
import { photoAiTags } from '@/lib/photo-ai-tags';
import { formatDateJaJst } from '@/lib/date';
import { feedCardTags } from '@/lib/feed-card-tags';
import { FEED_CHIP_CLASS } from '@/lib/feed-chip-class';
import { manholeHeading } from '@/lib/manhole-label';
import { loadSharedPhotoExtras } from '@/lib/shared-photo-extras';
import { isMeaningfulVisitComment, normalizeVisitComment } from '@/lib/visit-comment-quality';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL } from '@/lib/constants';
import { photoShareText } from '@/lib/share';
import { createServerClient } from '@/lib/supabase/server';
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
  const title = `${locationLabel}の${photo.is_landscape ? '周辺の風景' : 'ポケふた写真'}${pokemonText} | ${SITE_NAME}`;
  const description = photo.visit.comment
    ? photo.visit.comment
    : `${locationLabel}の${photo.is_landscape ? 'ポケふた周辺の風景' : 'ポケふた写真'}です。`;
  const pageUrl = `${SITE_URL}/p/${photo.id}`;
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

  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isOwner = session?.user?.id === photo.visit.user_id;

  const titles = getSortedTitles(photo.manhole.titles);
  const locationLabel = getManholeLocationLabel(photo.manhole);
  const shareHashtags = titles.slice(0, 2).map((t) => t.hashtag).filter((h): h is string => Boolean(h));
  const shareText = photoShareText(locationLabel, shareHashtags, photo.manhole.pokemons);
  const shareUrl = `${SITE_URL}/p/${photo.id}`;

  const extras = await loadSharedPhotoExtras(supabase, photo);
  // 見出しは蓋詳細と同じ正本の名前（「甲賀市 鹿深夢の森のポケふた（ゲコガシラ・ゲッコウガ）」）
  const heading = manholeHeading({ ...photo.manhole, name: extras.manholeName });
  const chips = feedCardTags(
    { id: photo.visit.id, manhole_id: photo.manhole.id, shot_at: photo.visit.shot_at, manhole: { pokemons: photo.manhole.pokemons } },
    undefined,
  );
  const comment = isMeaningfulVisitComment(photo.visit.comment) ? normalizeVisitComment(photo.visit.comment) : null;
  const posterHref = extras.posterPublicId ? `/users/${encodeURIComponent(extras.posterPublicId)}/visits` : null;
  const manholeHref = `/manhole/${photo.manhole.id}`;

  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-4xl px-4 pb-5 pt-3 sm:pb-8 sm:pt-6">
        {/*
          写真が主役。以前は横長の枠に切り抜き、下半分に見出しを重ねていたので、蓋やぬいぐるみが切れていた。
          写真は切らずに全体を出し、見出し以下は写真の下に置く。
          行き先は2つ: 投稿者のページ（投稿者の欄）と蓋の詳細（いちばん下）。
        */}
        <article className="overflow-hidden rounded-[12px] border border-[#8C6A4A]/20 bg-[#FFF8EB] shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
          {/*
            枠の比率を先に決めて場所を取っておく（読み込みが遅いと高さ0から押し広げて見出し以下がずれる。CLS）。
            写真は枠の中に切らずに収め、余りは暗い背景。DB の width/height は回転前の値のことがあるので使わない
          */}
          <div className="relative aspect-[4/5] max-h-[78vh] w-full bg-[#1c1a17] sm:aspect-[4/3]">
            <img
              src={`/api/photo/${photo.id}?size=large`}
              alt={`${heading}の${photo.is_landscape ? '周辺の風景' : '写真'}`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            {(photo.is_landscape || photoAiTags(photo).length > 0 || chips.length > 0) && (
              <div className="flex flex-wrap items-center gap-1">
                <LandscapePhotoBadge isLandscape={photo.is_landscape} />
                <AiPhotoTags photo={photo} linkFeatures />
                {chips.map((chip) => (
                  <span key={chip.tag} className={`rounded-full px-2 py-1 text-xs font-extrabold leading-none shadow-sm ${FEED_CHIP_CLASS[chip.tag]}`}>
                    {chip.label}
                  </span>
                ))}
              </div>
            )}

            <div>
              <h1 className="font-pixelJp text-xl font-black leading-tight text-[#2c2a26] sm:text-2xl">{heading}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm font-bold text-[#6f6657]">
                <MapPin className="h-4 w-4 shrink-0" />
                {photo.manhole.prefecture} / {photo.manhole.municipality || '場所未設定'}
                {photo.manhole.building ? ` ・ ${photo.manhole.building}` : ''}
              </p>
            </div>

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

            {/* 投稿者。押すと投稿者のページへ */}
            <div className="flex items-center gap-3 rounded-[10px] border border-[#8C6A4A]/15 bg-white/80 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7B63A8]/10 text-[#7B63A8]">
                <UserRound className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-[#8b816f]">投稿者</p>
                {posterHref ? (
                  <Link href={posterHref} className="flex min-w-0 items-center gap-0.5 font-extrabold text-[#7B63A8] hover:underline">
                    <span className="truncate">@{extras.posterName}</span>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </Link>
                ) : (
                  <p className="truncate font-extrabold text-[#4F3828]">@{extras.posterName}</p>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF1F1] px-2.5 py-1 text-xs font-extrabold text-[#D94D3F]" aria-label={`いいね ${extras.likesCount}件`}>
                <Heart className="h-3.5 w-3.5" />
                {extras.likesCount}
              </span>
            </div>

            {comment && (
              <div className="rounded-[10px] border border-[#8C6A4A]/15 bg-white/80 p-3">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#8b816f]">
                  <MessageCircle className="h-3.5 w-3.5" />
                  ひとこと
                </p>
                <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#4F3828]">{comment}</p>
              </div>
            )}

            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-[8px] bg-white/70 px-3 py-2">
                <Camera className="h-4 w-4 shrink-0 text-[#B5483C]" />
                <dt className="text-xs font-bold text-[#8b816f]">撮影日</dt>
                <dd className="font-bold text-[#4F3828]">{formatDateJaJst(photo.visit.shot_at)}</dd>
              </div>
              <div className="flex items-center gap-2 rounded-[8px] bg-white/70 px-3 py-2">
                <Calendar className="h-4 w-4 shrink-0 text-[#7B63A8]" />
                <dt className="text-xs font-bold text-[#8b816f]">投稿日</dt>
                <dd className="font-bold text-[#4F3828]">{formatDateJaJst(photo.created_at)}</dd>
              </div>
              {photo.manhole.address && (
                <div className="flex items-center gap-2 rounded-[8px] bg-white/70 px-3 py-2 sm:col-span-2">
                  <MapPin className="h-4 w-4 shrink-0 text-[#2b7a78]" />
                  <dt className="shrink-0 text-xs font-bold text-[#8b816f]">住所</dt>
                  <dd className="min-w-0 truncate font-bold text-[#4F3828]">{photo.manhole.address}</dd>
                </div>
              )}
            </dl>

            {extras.otherPhotos.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-[#4F3828]">
                  <ImageIcon className="h-4 w-4" />
                  このポケふたの他の写真
                  <span className="text-xs font-bold text-[#8b816f]">{extras.otherCount}枚</span>
                </h2>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {extras.otherPhotos.map((other) => (
                    <li key={other.id}>
                      <Link href={`/p/${other.id}`} className="block aspect-square overflow-hidden rounded-[6px] bg-[#ece2cd]" aria-label={`${formatDateJaJst(other.shotAt ?? '')}撮影の写真`}>
                        <img src={`/api/photo/${other.id}?size=small`} alt="" width={120} height={120} loading="lazy" className="h-full w-full object-cover" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <ShareButtons
              label="この写真を共有する"
              shareText={shareText}
              shareUrl={shareUrl}
              hashtags={shareHashtags}
            />

            {/* 蓋の詳細へはいちばん下から */}
            <div className="flex flex-col gap-2 border-t border-[#8C6A4A]/15 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={manholeHref}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#7B63A8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
              >
                このポケふたの詳細へ
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="/upload"
                className="inline-flex items-center justify-center rounded-lg border border-[#7B63A8] bg-white px-5 py-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
              >
                自分も記録する
              </Link>
              {isOwner && (
                <PhotoDeleteButton
                  visitId={photo.visit.id}
                  manholeId={photo.manhole.id}
                />
              )}
            </div>
          </div>
        </article>
        <AiTagNote className="mt-2 px-1" show={photoAiTags(photo).length > 0} />
      </main>

    </div>
  );
}
