import type { Metadata } from 'next';
import ManholePage from './ManholePage';
import { loadPhotoForOgp } from '@/lib/manhole-ogp';
import { fetchSnapshotManhole } from '@/lib/manhole-snapshot';
import {
  manholeLabel,
  manholeLocationLabel,
  manholePlaceLabel,
  pokemonText,
} from '@/lib/manhole-label';
import { getSortedTitles } from '@/lib/shared-photo';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL, pageTitle } from '@/lib/constants';
import type { ManholeTitle } from '@/types/database';

type Props = {
  params: { id: string };
  searchParams: { photo?: string };
};

export const dynamic = 'force-dynamic';

type ManholeMetaSource = {
  prefecture?: string | null;
  city?: string | null;
  municipality?: string | null;
  pokemons?: string[] | null;
  title?: string | null;
  titles?: ManholeTitle[] | null;
};

/**
 * title / description / JSON-LD は**このファイルだけ**が作る。
 *
 * 以前は `ManholePage.tsx` の `useEffect` が同じ3点を別ルールで上書きしており、
 * クローラとOGPが見るサーバ側の値と、人が見るクライアント側の値が食い違っていた。
 * しかも図鑑（data.pokefuta.com）と形式が揃っていたのは**クライアント側だけ**で、
 * 揃っている方が検索エンジンには届いていなかった。
 *
 * 文言の形式は図鑑の `generate_manhole_pages.py` に合わせる:
 *   title = 「{都道府県}{市区町村}のポケふた｜{ポケモン}」
 *   h1    = 「{都道府県}{市区町村}のポケふた（{ポケモン}）」（→ ManholePage.tsx）
 * ただし `og:title` は図鑑と同じく**称号を前置きする**。共有カードでは称号が効くが、
 * `<title>` に入れると同じ蓋の title が両サイトで別物になるため、そこだけ分けている。
 */
function buildManholeMeta(manhole: ManholeMetaSource) {
  const locationLabel = manholeLocationLabel(manhole);
  const placeLabel = manholePlaceLabel(manhole);
  const pokemons = pokemonText(manhole.pokemons);
  const topTitle = getSortedTitles(manhole.titles)[0];
  const title = pageTitle(`${placeLabel}｜${pokemons}`);

  return {
    title,
    ogTitle: topTitle ? `${topTitle.label} | ${placeLabel} | ${SITE_NAME}` : title,
    description: `${locationLabel}にある、${pokemons}が描かれたポケモンマンホール「ポケふた」の場所、写真、訪問記録を確認できます。経路案内や写真登録にも対応。`,
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const manholeId = Number(params.id);
  if (isNaN(manholeId)) {
    return { title: `マンホールが見つかりません | ${SITE_NAME}` };
  }

  const manhole = await fetchSnapshotManhole(manholeId);
  if (!manhole) {
    return { title: `マンホールが見つかりません | ${SITE_NAME}` };
  }

  const { title, ogTitle, description } = buildManholeMeta(manhole);
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

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'website',
      title: ogTitle,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function Page({ params }: Props) {
  const manholeId = Number(params.id);
  const manhole = isNaN(manholeId) ? null : await fetchSnapshotManhole(manholeId);

  // JSON-LD もサーバで出す。クライアントで `document.head` に差し込んでいた頃は、
  // JS を実行しないクローラには構造化データが1件も届いていなかった。
  // 形は図鑑の TouristAttraction に合わせる（name は h1、address / geo つき）。
  const jsonLd = manhole
    ? {
        '@context': 'https://schema.org',
        '@type': 'TouristAttraction',
        name: manholeLabel(manhole),
        description: buildManholeMeta(manhole).description,
        url: `${SITE_URL}/manhole/${manhole.id}`,
        ...(manhole.address
          ? {
              address: {
                '@type': 'PostalAddress',
                addressRegion: manhole.prefecture,
                addressLocality: manhole.city || manhole.municipality || undefined,
                streetAddress: manhole.address,
              },
            }
          : {}),
        ...(manhole.latitude != null && manhole.longitude != null
          ? {
              geo: {
                '@type': 'GeoCoordinates',
                latitude: manhole.latitude,
                longitude: manhole.longitude,
              },
            }
          : {}),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ManholePage />
    </>
  );
}
