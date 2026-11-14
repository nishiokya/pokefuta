import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MapSection from './MapSection';
import { loadPublishedDesignManholes } from '@/lib/design-manhole-ogp';
import { resolveDesignManholePrefectures } from '@/lib/design-manhole-prefecture';
import { loadDesignManholeSubmitterPublicIdCached } from '@/lib/design-manhole-submitter';
import { OGP_IMAGE_URL, SITE_NAME, SITE_URL } from '@/lib/constants';
import { SubmitCta, SuspendedNotice } from '@/components/DesignManhole/SubmitCta';
import { MovedToPokefutaNotice } from '@/components/DesignManhole/MovedToPokefutaNotice';
import { PhraseText } from '@/components/PhraseText';
import DesignManholeCard from '@/components/DesignManhole/DesignManholeCard';
import { DESIGN_MANHOLE_SUBMISSION_SUSPENDED } from '@/lib/design-manhole-submission-status';
import type { DesignManhole } from '@/types/database';

// Amplify ではビルド時静的化で内容が凍結する事故があるため（/api/site-stats と同じ）、
// 常にサーバーレンダリングする。キャッシュは CDN 側に任せる
export const dynamic = 'force-dynamic';
// supabase-js の PostgREST GET が Next の Data Cache に乗ると新規投稿が一覧に
// 反映されず hidden 行も消えない（/api/design-manholes と同じ理由）
export const fetchCache = 'force-no-store';

const PAGE_URL = `${SITE_URL}/design-manholes`;
const PAGE_TITLE = `みんなのデザインマンホール | ${SITE_NAME}`;
const PAGE_DESCRIPTION =
  'ポケふた以外の、オンリーワンなご当地デザインマンホールのコレクション。街のシンボルや市の花のデザイン蓋、カラーマンホールなど、みんなが見つけた1枚を地図と一覧で紹介。あなたの街の蓋も投稿できます。';

// 1ページに並べる枚数。投稿者の公開IDをカードごとに引くので、全件ではなくページ分だけにする
const PAGE_SIZE = 48;

type PageProps = { searchParams?: { page?: string | string[] } };

/** ?page=N（1始まり）。数字でないものは null（404 にする） */
function parsePage(searchParams: PageProps['searchParams']): number | null {
  const raw = searchParams?.page;
  if (raw === undefined) return 1;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!/^[1-9][0-9]{0,3}$/.test(value)) return null;
  return Number(value);
}

function pageHref(page: number): string {
  return page <= 1 ? '/design-manholes' : `/design-manholes?page=${page}`;
}

export function generateMetadata({ searchParams }: PageProps): Metadata {
  const page = parsePage(searchParams) ?? 1;
  // 2ページ目以降はそれぞれを正規URLにする（1ページ目に寄せると2ページ目以降の蓋が辿られなくなる）
  const canonical = page > 1 ? `${PAGE_URL}?page=${page}` : PAGE_URL;
  const title = page > 1 ? `みんなのデザインマンホール（${page}ページ目） | ${SITE_NAME}` : PAGE_TITLE;
  return { ...metadata, title, alternates: { canonical } };
}

const metadata: Metadata = {
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

// tracker (data.pokefuta.com/design_manhole.html) の「こんな1枚を待っています」と同じ文言
const WANTED_EXAMPLES = [
  { icon: '🏯', title: '街のシンボル・名所デザイン', note: '城・橋・祭りなど、その街ならではの蓋' },
  { icon: '🌸', title: '市の花・木・鳥デザイン', note: '定番だけど地域ごとに全部違う定番蓋' },
  { icon: '🎨', title: 'カラーマンホール', note: '色付きの蓋はそれだけでレア。見つけたらぜひ' },
  { icon: '🚒', title: '消火栓・防火水槽のデザイン蓋', note: 'マンホール以外の丸い鉄蓋も大歓迎' },
];

function WantedSection() {
  return (
    <section className="mt-6 rounded-lg border border-dm-line/15 bg-white/70 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-dm-line">こんな1枚を待っています</h2>
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
        <SubmitCta surface="design_manhole_list_header" className="inline-flex items-center gap-1.5 rounded-lg bg-dm-line px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]" />
      </div>
    </section>
  );
}

export default async function DesignManholesPage({ searchParams }: PageProps) {
  const page = parsePage(searchParams);
  if (page === null) notFound();

  let designManholes: DesignManhole[] = [];
  let loadError = false;
  try {
    // 地図と枚数は全件、カードはページ分だけ並べる
    designManholes = await loadPublishedDesignManholes();
  } catch (error) {
    console.error('Failed to load design manholes for listing:', error);
    loadError = true;
  }
  const totalPages = Math.max(1, Math.ceil(designManholes.length / PAGE_SIZE));
  if (!loadError && page > totalPages) notFound();
  const pageItems = designManholes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 地図の初期表示（県ごとの枚数）用。一覧の並びや枚数には使わない
  const [prefectureById, posterPublicIds] = await Promise.all([
    designManholes.length > 0 ? resolveDesignManholePrefectures(designManholes) : Promise.resolve({}),
    // 投稿者のページへのリンク用。公開スタンプ帳を持たない人は null（カードはマンホールのページへ）
    Promise.all(pageItems.map((dm) => loadDesignManholeSubmitterPublicIdCached(dm.id))),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'みんなのデザインマンホール',
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    numberOfItems: designManholes.length,
    itemListElement: pageItems.slice(0, 30).map((dm, index) => ({
      '@type': 'ListItem',
      position: (page - 1) * PAGE_SIZE + index + 1,
      name: dm.title || 'デザインマンホール',
      url: `${PAGE_URL}/${dm.id}`,
    })),
  };

  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <script
        type="application/ld+json"
        // title はユーザー入力なので、</script> 挿入によるXSSを防ぐため < をエスケープする
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <main className="mx-auto max-w-page px-4 lg:px-8 pb-8 pt-5 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold sm:text-xl">みんなのデザインマンホール</h1>
            <p className="mt-1 text-sm text-[#2A2A2A]/70">
              <PhraseText text="ポケふた以外の、オンリーワンなデザインマンホールのコレクション" />
            </p>
            {/*
              枚数は地図に出している全件の配列の長さを使う。別途数え直すと
              一覧と数字がズレうるが、これなら構造上ズレない（追加の問い合わせも無い）。
              DESIGN_MANHOLE_LOAD_LIMIT に近づいたら読み方を変える（design-manhole-ogp.ts）。
            */}
            {designManholes.length > 0 && (
              <p className="mt-2 text-sm font-bold text-dm-ink">
                いま <span className="text-base">{designManholes.length}</span> 枚集まっています
              </p>
            )}
          </div>
          <SubmitCta surface="design_manhole_list_toolbar" className="flex items-center gap-1.5 rounded-lg bg-dm-line px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]" />
        </div>

        <SuspendedNotice />
        <MovedToPokefutaNotice />

        {loadError ? (
          <p className="mt-5 rounded-lg border border-[#B5483C]/30 bg-[#B5483C]/10 p-3 text-sm text-[#B5483C]">
            一覧の取得に失敗しました。時間をおいて再度お試しください。
          </p>
        ) : designManholes.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dm-line/15 bg-white/70 p-8 text-center">
            <p className="text-sm text-[#2A2A2A]/70">
              {DESIGN_MANHOLE_SUBMISSION_SUSPENDED
                ? 'まだ投稿がありません。'
                : 'まだ投稿がありません。最初の1枚を投稿してみませんか？'}
            </p>
            <SubmitCta surface="design_manhole_list_empty" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-dm-line px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]" />
          </div>
        ) : (
          <>
            <div className="mt-5">
              <MapSection designManholes={designManholes} prefectureById={prefectureById} />
            </div>

            {/* 写真と投稿者を押すと投稿者のページへ（/photos/plush と同じ）。名前の行はマンホールのページへ */}
            <ul id="list" className="mt-6 grid scroll-mt-20 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
              {pageItems.map((dm, index) => (
                <li key={dm.id}>
                  <DesignManholeCard designManhole={dm} posterPublicId={posterPublicIds[index] ?? null} eager={index < 6} />
                </li>
              ))}
            </ul>
            <Pager page={page} totalPages={totalPages} />
          </>
        )}

        <WantedSection />
      </main>

    </div>
  );
}

function Pager({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const linkClass = 'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full px-3 text-sm font-bold transition';
  return (
    <nav aria-label="ページ送り" className="mt-6 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={`${pageHref(page - 1)}#list`} rel="prev" className={`${linkClass} bg-white text-dm-line ring-1 ring-dm-line/30 hover:bg-[#F3EEFA]`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          前へ
        </Link>
      ) : null}
      {pages.map((n) =>
        n === page ? (
          <span key={n} aria-current="page" className={`${linkClass} bg-dm-line text-white`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={`${pageHref(n)}#list`} className={`${linkClass} bg-white text-dm-line ring-1 ring-dm-line/30 hover:bg-[#F3EEFA]`}>
            {n}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={`${pageHref(page + 1)}#list`} rel="next" className={`${linkClass} bg-white text-dm-line ring-1 ring-dm-line/30 hover:bg-[#F3EEFA]`}>
          次へ
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
