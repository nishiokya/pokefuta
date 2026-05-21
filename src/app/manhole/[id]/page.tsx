import type { Metadata } from 'next';
import ManholePage from './ManholePage';
import { loadManholeForOgp, loadPhotoForOgp } from '@/lib/manhole-ogp';
import { getManholeLocationLabel, getSortedTitles } from '@/lib/shared-photo';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL } from '@/lib/constants';

type Props = {
  params: { id: string };
  searchParams: { photo?: string };
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const manholeId = Number(params.id);
  if (isNaN(manholeId)) {
    return { title: `マンホールが見つかりません | ${SITE_NAME}` };
  }

  const manhole = await loadManholeForOgp(manholeId);
  if (!manhole) {
    return { title: `マンホールが見つかりません | ${SITE_NAME}` };
  }

  const locationLabel = getManholeLocationLabel(manhole);
  const topTitle = getSortedTitles(manhole.titles)[0];
  const photoIdParam = searchParams?.photo;

  let validPhotoId: string | undefined;
  if (photoIdParam) {
    const photo = await loadPhotoForOgp(photoIdParam, manholeId);
    if (photo) validPhotoId = photo.id;
  }

  const pageUrl = `${SITE_URL}/manhole/${manholeId}`;
  const canonicalUrl = validPhotoId ? `${pageUrl}?photo=${validPhotoId}` : pageUrl;
  const ogImageUrl = validPhotoId
    ? `${SITE_URL}/manhole/${manholeId}/opengraph-image?photo=${validPhotoId}&v=${OGP_IMAGE_VERSION}`
    : `${SITE_URL}/manhole/${manholeId}/opengraph-image?v=${OGP_IMAGE_VERSION}`;

  const title = topTitle
    ? `${topTitle.label} | ${locationLabel}のポケふた | ${SITE_NAME}`
    : `${locationLabel}のポケふた | ${SITE_NAME}`;
  const description = `${locationLabel}で見つけたポケふた。全国のポケモンマンホールをめぐるスタンプ帳。`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonicalUrl,
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

export default function Page() {
  return <ManholePage />;
}
