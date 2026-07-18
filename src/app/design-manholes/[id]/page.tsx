import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, Share2 } from 'lucide-react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import MapSection from '../MapSection';
import { loadDesignManholeForOgp } from '@/lib/design-manhole-ogp';
import { buildXShareUrl, buildLineShareUrl, designManholeShareText } from '@/lib/share';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL } from '@/lib/constants';
import type { DesignManhole } from '@/types/database';

type Props = {
  params: { id: string };
};

export const dynamic = 'force-dynamic';

const NOT_FOUND_METADATA: Metadata = {
  title: `投稿が見つかりません | ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

const displayTitle = (title: string | null) => title || 'デザインマンホール';

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

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
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <script
        type="application/ld+json"
        // title 等はユーザー入力なので、</script> 挿入によるXSSを防ぐため < をエスケープする
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Header title="デザインマンホール" showDescriptionLink={false} />

      <main className="mx-auto max-w-3xl px-4 pb-8 pt-5 sm:pt-8">
        <nav className="text-xs text-[#2A2A2A]/60">
          <Link href="/design-manholes" className="hover:underline">
            みんなのデザインマンホール
          </Link>
          <span className="mx-1">/</span>
          <span>{title}</span>
        </nav>

        <article className="mt-4 overflow-hidden rounded-lg border border-[#7B63A8]/15 bg-white shadow-sm">
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
              {designManhole.submitter_name ? `${designManhole.submitter_name} ・ ` : ''}
              {formatDate(designManhole.created_at)}
            </p>
            {designManhole.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-[#2A2A2A]/80">
                {designManhole.description}
              </p>
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
          </div>
        </article>

        <div className="mt-5">
          <MapSection designManholes={[mapItem]} />
        </div>

        <div className="mt-6 rounded-lg border border-[#7B63A8]/15 bg-white/70 p-5 text-center">
          <p className="text-sm text-[#2A2A2A]/70">
            あなたの街のデザインマンホールも投稿してみませんか？
          </p>
          <Link
            href="/design-manholes/new"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
          >
            <Plus className="h-4 w-4" />
            投稿する
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
