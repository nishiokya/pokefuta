import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, MapPin, Navigation, Share2, Tag } from 'lucide-react';
import MapSection from '../MapSection';
import { SubmitCta } from '@/components/DesignManhole/SubmitCta';
import { DESIGN_MANHOLE_SUBMISSION_SUSPENDED } from '@/lib/design-manhole-submission-status';
import { loadDesignManholeForOgp, loadPublishedDesignManholes } from '@/lib/design-manhole-ogp';
import {
  loadDesignManholeSubmitterProfile,
  loadSnapshotManholesForNearby,
  nearbyDesignManholes,
  nearbyPokefuta,
} from '@/lib/design-manhole-detail-extras';
import NearbyPokefutaList from '@/components/DesignManhole/NearbyPokefutaList';
import PosterRegularBadge from '@/components/PosterRegularBadge';
import UserAvatar from '@/components/users/UserAvatar';
import { formatDistanceKm } from '@/lib/manhole-label';
import { loadDesignManholeSubmitterPublicId } from '@/lib/design-manhole-submitter';
import { loadDesignManholeLink } from '@/lib/design-manhole-link';
import { buildXShareUrl, buildLineShareUrl, designManholeShareText } from '@/lib/share';
import { formatDateJaJst } from '@/lib/date';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL } from '@/lib/constants';
import type { DesignManhole } from '@/types/database';

type Props = {
  params: { id: string };
};

export const dynamic = 'force-dynamic';
// supabase-js の GET が Data Cache に乗ると hidden 化した投稿のページが
// 404 にならず残り続けるため無効化（/api/design-manholes と同じ理由）
export const fetchCache = 'force-no-store';

const NOT_FOUND_METADATA: Metadata = {
  title: `投稿が見つかりません | ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

const displayTitle = (title: string | null) => title || 'デザインマンホール';

const TAG_CLASS =
  'inline-flex items-center gap-1 rounded-full border border-[#7B63A8]/25 bg-[#7B63A8]/5 px-2.5 py-1 text-xs font-bold text-[#7B63A8]';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const designManhole = await loadDesignManholeForOgp(params.id);
  if (!designManhole) {
    return NOT_FOUND_METADATA;
  }

  const pageUrl = `${SITE_URL}/design-manholes/${designManhole.id}`;
  const ogImageUrl = `${SITE_URL}/design-manholes/${designManhole.id}/opengraph-image?v=${OGP_IMAGE_VERSION}`;
  const title = `${displayTitle(designManhole.title)} | みんなのデザインマンホール | ${SITE_NAME}`;
  const description =
    designManhole.description ||
    `${designManhole.submitter_name ? `${designManhole.submitter_name}さんが見つけた` : 'みんなで集める'}ご当地デザインマンホール。ポケふた以外のオンリーワンなマンホールのコレクション。`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'website',
      title,
      description,
      url: pageUrl,
      siteName: SITE_NAME,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function Page({ params }: Props) {
  const designManhole = await loadDesignManholeForOgp(params.id);
  if (!designManhole) {
    notFound();
  }

  // 公開投稿に紐付くプロフィールがあれば、訪問0件でもスタンプ帳へのリンクとカードを出す
  // 紐付いたキャラクターマンホール（図鑑が持つ）、近くのポケふた（図鑑のスナップショット）、
  // 近くのデザインマンホール（一覧と同じ公開200件）も並べて読む。どれも取れなければその節を出さないだけ
  const submitterPublicIdPromise = loadDesignManholeSubmitterPublicId(designManhole.id);
  const [submitterPublicId, submitterProfile, characterLink, snapshotManholes, allDesignManholes] = await Promise.all([
    submitterPublicIdPromise,
    submitterPublicIdPromise.then((id) => (id ? loadDesignManholeSubmitterProfile(id) : null)),
    loadDesignManholeLink(designManhole.id),
    loadSnapshotManholesForNearby(),
    loadPublishedDesignManholes(200).catch((error) => {
      console.warn('Failed to load design manholes for nearby:', error);
      return [];
    }),
  ]);
  const { nearby: nearbyPokefutaItems, nearbyIsFallback, placeTags } = nearbyPokefuta(designManhole, snapshotManholes);
  const nearbyDesignItems = nearbyDesignManholes(designManhole, allDesignManholes);
  const submitterHref = submitterPublicId ? `/users/${encodeURIComponent(submitterPublicId)}/visits` : null;

  const title = displayTitle(designManhole.title);
  const pageUrl = `${SITE_URL}/design-manholes/${designManhole.id}`;
  const photoUrl = `/api/design-manholes/${designManhole.id}/photo`;
  const shareText = designManholeShareText(designManhole.title);
  const xShareUrl = buildXShareUrl(shareText, pageUrl, ['デザインマンホール', 'マンホール'], {
    includeDefaultHashtags: false,
  });
  const lineShareUrl = buildLineShareUrl(pageUrl);

  // DetailMap（DesignManholeMap）は一覧APIの公開型を受けるので同じ形に揃える
  const mapItem: DesignManhole = {
    id: designManhole.id,
    title: designManhole.title,
    description: designManhole.description,
    submitter_name: designManhole.submitter_name,
    latitude: designManhole.latitude,
    longitude: designManhole.longitude,
    width: designManhole.width,
    height: designManhole.height,
    created_at: designManhole.created_at,
    photo_url: `${photoUrl}?size=small`,
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ImageObject',
        contentUrl: `${SITE_URL}${photoUrl}`,
        name: title,
        description: designManhole.description || undefined,
        creditText: designManhole.submitter_name || undefined,
        uploadDate: designManhole.created_at,
        contentLocation: {
          '@type': 'Place',
          geo: {
            '@type': 'GeoCoordinates',
            latitude: designManhole.latitude,
            longitude: designManhole.longitude,
          },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'みんなのデザインマンホール',
            item: `${SITE_URL}/design-manholes`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: title,
            item: pageUrl,
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <script
        type="application/ld+json"
        // title 等はユーザー入力なので、</script> 挿入によるXSSを防ぐため < をエスケープする
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <main className="mx-auto max-w-page px-4 lg:px-8 pb-8 pt-5 sm:pt-8">
        <nav className="text-xs text-[#2A2A2A]/60">
          <Link href="/design-manholes" className="hover:underline">
            みんなのデザインマンホール
          </Link>
          <span className="mx-1">/</span>
          <span>{title}</span>
        </nav>

        {/* PC は本文が --page-max-wide まで広がるので、写真と説明を横に並べる */}
        <article className="mt-4 overflow-hidden rounded-lg border border-[#7B63A8]/15 bg-white shadow-sm lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="bg-[#EFE5CE]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={title}
              className="mx-auto max-h-[70vh] w-full object-contain"
            />
          </div>
          <div className="p-4 sm:p-5">
            <h1 className="text-lg font-bold sm:text-xl">{title}</h1>
            <p className="mt-1 text-xs text-[#2A2A2A]/50">
              {submitterHref ? (
                <>
                  <Link href={submitterHref} className="font-bold text-[#7B63A8] hover:underline">
                    {designManhole.submitter_name || '投稿者'}のスタンプ帳 ›
                  </Link>
                  {' ・ '}
                </>
              ) : (
                designManhole.submitter_name ? `${designManhole.submitter_name} ・ ` : ''
              )}
              {formatDateJaJst(designManhole.created_at)}
            </p>
            {designManhole.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-[#2A2A2A]/80">
                {designManhole.description}
              </p>
            )}

            {(placeTags.length > 0 || characterLink) && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="タグ">
                {placeTags.map((tag) => (
                  <li key={tag.label}>
                    {tag.href ? (
                      <a href={tag.href} className={TAG_CLASS}>
                        <Tag className="h-3 w-3" aria-hidden="true" />
                        {tag.label}
                      </a>
                    ) : (
                      <span className={TAG_CLASS}>
                        <Tag className="h-3 w-3" aria-hidden="true" />
                        {tag.label}
                      </span>
                    )}
                  </li>
                ))}
                {characterLink && (
                  <li>
                    <a href={characterLink.guide_url} className={TAG_CLASS}>
                      <Tag className="h-3 w-3" aria-hidden="true" />
                      {characterLink.work_name}
                    </a>
                  </li>
                )}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href={xShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#2A2A2A] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#444444]"
              >
                <Share2 className="h-4 w-4" />
                Xでシェア
              </a>
              <a
                href={lineShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#06C755] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#05B34C]"
              >
                LINEで送る
              </a>
            </div>
            {submitterProfile && submitterHref && (
              <section aria-label="投稿者" className="mt-5 rounded-lg border border-[#7B63A8]/15 bg-[#F6EEDC]/60 p-4">
                <p className="text-xs font-bold tracking-wide text-[#7B63A8]">投稿したトレーナー</p>
                <Link href={submitterHref} className="mt-2 flex items-center gap-3 hover:opacity-80">
                  <UserAvatar
                    photoId={submitterProfile.avatarPhotoId}
                    size={44}
                    alt={`${submitterProfile.displayName}のアイコン`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <PosterRegularBadge publicUserId={submitterProfile.publicId} />
                      <span className="font-bold">{submitterProfile.displayName}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-[#2A2A2A]/60">
                      {[
                        submitterProfile.totalVisits > 0 && `ポケふた ${submitterProfile.totalVisits}枚`,
                        submitterProfile.prefectureCount > 0 && `${submitterProfile.prefectureCount}都道府県`,
                        submitterProfile.designManholeCount > 0 &&
                          `デザインマンホール ${submitterProfile.designManholeCount}枚`,
                      ]
                        .filter(Boolean)
                        .join(' ・ ')}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#7B63A8]" aria-hidden="true" />
                </Link>
              </section>
            )}
            {characterLink && (
              <section
                aria-labelledby="character-link-heading"
                className="mt-5 overflow-hidden rounded-lg border border-[#7B63A8]/25 bg-white"
              >
                <div className="flex items-start gap-3 p-4 sm:p-5">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7B63A8] text-white"
                  >
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold tracking-wide text-[#7B63A8]">キャラクターマンホール</p>
                    <h2 id="character-link-heading" className="mt-0.5 text-base font-bold sm:text-lg">
                      {characterLink.work_name}のマンホール
                    </h2>
                    <p className="mt-1 text-sm text-[#2A2A2A]/80">
                      {characterLink.place}
                      {(characterLink.prefecture || characterLink.city) && (
                        <span className="text-[#2A2A2A]/60">
                          （{characterLink.prefecture}
                          {characterLink.city}）
                        </span>
                      )}
                    </p>
                    {characterLink.spots > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-[#2A2A2A]/60">
                          全国{characterLink.spots}枚のうち、写真が投稿されているのは
                          <span className="font-bold text-[#2A2A2A]">{characterLink.spots_with_photo}枚</span>
                        </p>
                        <div
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#7B63A8]/15"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-[#7B63A8]"
                            style={{
                              width: `${Math.min(100, Math.round((characterLink.spots_with_photo / characterLink.spots) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-[#7B63A8]/10 bg-[#7B63A8]/5 px-4 py-3 sm:px-5">
                  <a
                    href={characterLink.url}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#7B63A8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#6A5299]"
                  >
                    ポケふた図鑑で設置場所を見る
                    <ChevronRight className="h-4 w-4" />
                  </a>
                  <a
                    href={characterLink.guide_url}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#7B63A8]/30 bg-white px-4 py-2 text-sm font-bold text-[#7B63A8] transition hover:bg-[#7B63A8]/5"
                  >
                    {characterLink.work_name}のマンホールを巡る
                  </a>
                </div>
              </section>
            )}
          </div>
        </article>

        <div className="mt-5">
          <MapSection designManholes={[mapItem]} />
        </div>

        {(nearbyPokefutaItems.length > 0 || nearbyDesignItems.length > 0) && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
            {nearbyPokefutaItems.length > 0 && (
              <section aria-labelledby="nearby-pokefuta-heading">
                <h2 id="nearby-pokefuta-heading" className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                  <Navigation className="h-4 w-4 text-[#7B63A8]" aria-hidden="true" />
                  {nearbyIsFallback ? 'いちばん近いポケふた' : '近くのポケふた'}
                </h2>
                <NearbyPokefutaList items={nearbyPokefutaItems} />
              </section>
            )}
            {nearbyDesignItems.length > 0 && (
              <section aria-labelledby="nearby-design-heading">
                <h2 id="nearby-design-heading" className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                  <MapPin className="h-4 w-4 text-[#7B63A8]" aria-hidden="true" />
                  近くのデザインマンホール
                </h2>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {nearbyDesignItems.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/design-manholes/${item.id}`}
                        className="block overflow-hidden rounded-lg border border-[#7B63A8]/15 bg-white transition hover:shadow-md"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.photoUrl}
                          alt={item.title}
                          loading="lazy"
                          className="aspect-square w-full bg-[#EFE5CE] object-cover"
                        />
                        <span className="block px-2 py-1.5">
                          <span className="block truncate text-xs font-bold">{item.title}</span>
                          <span className="block text-[11px] text-[#2A2A2A]/50">{formatDistanceKm(item.distanceKm)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-[#7B63A8]/15 bg-white/70 p-5 text-center">
          <p className="text-sm text-[#2A2A2A]/70">
            {DESIGN_MANHOLE_SUBMISSION_SUSPENDED
              ? '不具合のため、デザインマンホールの投稿を一時停止しています。'
              : 'あなたの街のデザインマンホールも投稿してみませんか？'}
          </p>
          <SubmitCta surface="design_manhole_detail" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]" />
        </div>
      </main>

    </div>
  );
}
