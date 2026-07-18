import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import MapSection from './MapSection';
import { loadPublishedDesignManholes } from '@/lib/design-manhole-ogp';
import { OGP_IMAGE_URL, SITE_NAME, SITE_URL } from '@/lib/constants';

// Amplify ではビルド時静的化で内容が凍結する事故があるため（/api/site-stats と同じ）、
// 常にサーバーレンダリングする。キャッシュは CDN 側に任せる
export const dynamic = 'force-dynamic';

const PAGE_URL = `${SITE_URL}/design-manholes`;
const PAGE_TITLE = `みんなのデザインマンホール | ${SITE_NAME}`;
const PAGE_DESCRIPTION =
  'ポケふた以外の、オンリーワンなご当地デザインマンホールのコレクション。街のシンボルや市の花のデザイン蓋、カラーマンホールなど、みんなが見つけた1枚を地図と一覧で紹介。あなたの街の蓋も投稿できます。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    siteName: SITE_NAME,
    images: [{ url: OGP_IMAGE_URL, width: 1200, height: 630, alt: PAGE_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [OGP_IMAGE_URL],
  },
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

// tracker (data.pokefuta.com/design_manhole.html) の「こんな1枚を待っています」と同じ文言
const WANTED_EXAMPLES = [
  { icon: '🏯', title: '街のシンボル・名所デザイン', note: '城・橋・祭りなど、その街ならではの蓋' },
  { icon: '🌸', title: '市の花・木・鳥デザイン', note: '定番だけど地域ごとに全部違う定番蓋' },
  { icon: '🎨', title: 'カラーマンホール', note: '色付きの蓋はそれだけでレア。見つけたらぜひ' },
  { icon: '🚒', title: '消火栓・防火水槽のデザイン蓋', note: 'マンホール以外の丸い鉄蓋も大歓迎' },
];

function WantedSection() {
  return (
    <section className="mt-6 rounded-lg border border-[#7B63A8]/15 bg-white/70 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-[#7B63A8]">こんな1枚を待っています</h2>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {WANTED_EXAMPLES.map((example) => (
          <li key={example.title} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="text-xl">{example.icon}</span>
            <span className="text-sm">
              <b>{example.title}</b>
              <span className="mt-0.5 block text-xs text-[#2A2A2A]/60">{example.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 text-center">
        <Link
          href="/design-manholes/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
        >
          <Plus className="h-4 w-4" />
          投稿する
        </Link>
      </div>
    </section>
  );
}

export default async function DesignManholesPage() {
  const designManholes = await loadPublishedDesignManholes(200);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'みんなのデザインマンホール',
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    numberOfItems: designManholes.length,
    itemListElement: designManholes.slice(0, 30).map((dm, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: dm.title || 'デザインマンホール',
      url: `${PAGE_URL}/${dm.id}`,
    })),
  };

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <script
        type="application/ld+json"
        // title はユーザー入力なので、</script> 挿入によるXSSを防ぐため < をエスケープする
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Header title="デザインマンホール" showDescriptionLink={false} />

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold sm:text-xl">みんなのデザインマンホール</h1>
            <p className="mt-1 text-sm text-[#2A2A2A]/70">
              ポケふた以外の、オンリーワンなデザインマンホールのコレクション
            </p>
          </div>
          <Link
            href="/design-manholes/new"
            className="flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
          >
            <Plus className="h-4 w-4" />
            投稿する
          </Link>
        </div>

        {designManholes.length === 0 ? (
          <div className="mt-5 rounded-lg border border-[#7B63A8]/15 bg-white/70 p-8 text-center">
            <p className="text-sm text-[#2A2A2A]/70">
              まだ投稿がありません。最初の1枚を投稿してみませんか？
            </p>
            <Link
              href="/design-manholes/new"
              className="mt-4 inline-block rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
            >
              投稿する
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <MapSection designManholes={designManholes} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {designManholes.map((dm) => (
                <Link
                  key={dm.id}
                  href={`/design-manholes/${dm.id}`}
                  className="overflow-hidden rounded-lg border border-[#7B63A8]/15 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="aspect-square bg-[#EFE5CE]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dm.photo_url}
                      alt={dm.title || 'デザインマンホール'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-sm font-bold">
                      {dm.title || 'デザインマンホール'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#2A2A2A]/50">
                      {dm.submitter_name ? `${dm.submitter_name} ・ ` : ''}
                      {formatDate(dm.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <WantedSection />
      </main>

      <BottomNav />
    </div>
  );
}
