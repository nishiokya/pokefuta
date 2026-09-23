import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PrefectureView from './PrefectureView';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import {
  buildPrefectureOverview,
  resolvePrefectureParam,
  type PrefectureOverview,
} from '@/lib/prefecture-page';
import { serializeJsonLd } from '@/lib/json-ld';
import { OGP_IMAGE_URL, SITE_NAME, SITE_URL, pageTitle } from '@/lib/constants';

type Props = {
  params: { prefecture: string };
};

export const dynamic = 'force-dynamic';

/**
 * title / description / JSON-LD は**このファイルだけ**が作る（`/manhole/[id]` と同じ約束）。
 *
 * 文言は図鑑（data.pokefuta.com）の都道府県ページとわざと変える。図鑑は
 * 「◯◯のポケふた最新50枚｜設置場所一覧・マップ」で、設置情報を引く人向け。
 * こちらは「写真が集まっているか」の側なので、同じ検索意図を狙わない。
 * 同じ題材で似た title を2ドメインに並べると、どちらも自分で薄めるだけになる。
 */
function buildMeta(overview: PrefectureOverview) {
  const { prefecture, total, withPhoto, missing, isComplete } = overview;
  const title = pageTitle(`${prefecture}のポケふた写真`);
  const description = isComplete
    ? `${prefecture}のポケふた${total}枚は、すべてに現地写真が集まりました。投稿された写真と設置場所の地図を確認できます。`
    : `${prefecture}のポケふた${total}枚のうち${withPhoto}枚に現地写真が集まっています。まだ写真がない${missing}枚と、最近投稿された写真を地図と一緒に確認できます。`;

  return { title, description };
}

const pageUrl = (prefecture: string) =>
  `${SITE_URL}/prefectures/${encodeURIComponent(prefecture)}`;

/**
 * スナップショットを読んで、その県ぶんに畳む。
 *
 * `null` は「この県にポケふたが無い（= 404）」、`throw` は「スナップショットが
 * 引けない（= 500）」。metadata と本文で同じ入り口を通しておかないと、
 * どちらの状況かの判定が2箇所でズレる。
 */
async function loadOverview(param: string): Promise<PrefectureOverview | null> {
  const prefecture = resolvePrefectureParam(param);
  if (!prefecture) return null;

  const snapshot = await fetchManholeSnapshot();
  if (!snapshot?.manholes) {
    // 障害を 404 にしない。404 は「このURLは恒久的に無い」という意味で、
    // 復旧までの数分にクロールされると実在するページがインデックスから落ちる。
    throw new Error(`Manhole snapshot is temporarily unavailable (prefecture=${prefecture})`);
  }

  return buildPrefectureOverview(snapshot.manholes, prefecture);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // metadata 側は障害でもページを落とさない（HTTPステータスを決めるのは Page の側）。
  const overview = await loadOverview(params.prefecture).catch(() => null);
  if (!overview) {
    return { title: `都道府県が見つかりません | ${SITE_NAME}` };
  }

  const { title, description } = buildMeta(overview);
  const url = pageUrl(overview.prefecture);

  return {
    title,
    description,
    alternates: { canonical: url },
    /*
      初回リリースは noindex, follow。
      sitemap から外すだけでは検索に出ないことは保証できない（クロールは
      リンクからも来る）。このページの主目的は内部回遊と投稿の導線であって
      検索流入ではないし、同じ都道府県で図鑑が既に評価を持っている。
      先に図鑑の評価を薄めるリスクを取る理由がないので、索引は止めて
      リンクは辿らせる（follow）。

      外すときは、図鑑と食い合わないだけの独自の中身が育ってからにすること。
      その判断をするまでは sitemap にも入れない。
    */
    robots: { index: false, follow: true },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: OGP_IMAGE_URL, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OGP_IMAGE_URL],
    },
  };
}

export default async function Page({ params }: Props) {
  const overview = await loadOverview(params.prefecture);
  if (!overview) notFound();

  const { title, description } = buildMeta(overview);

  // JSON-LD もサーバで出す。ただし図鑑が同じ県で ItemList を出しているので、
  // こちらは蓋を列挙しない。競合させずに「このページが何か」だけを名乗る。
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: pageUrl(overview.prefecture),
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <PrefectureView overview={overview} />
    </>
  );
}
