import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { loadPublishedDesignManholes } from '@/lib/design-manhole-ogp';
import { loadDesignManholeSubmitterPublicIdCached } from '@/lib/design-manhole-submitter';
import { loadDesignManholeTagData } from '@/lib/design-manhole-tags';
import {
  buildTagChips,
  cardTags,
  isValidTagSlug,
  relatedChips,
  tagHref,
  type DesignManholeTagGroup,
} from '@/lib/design-manhole-tag-data';
import { OGP_IMAGE_URL, SITE_NAME, SITE_URL } from '@/lib/constants';
import { SubmitCta } from '@/components/DesignManhole/SubmitCta';
import DesignManholeCard from '@/components/DesignManhole/DesignManholeCard';
import ListPager, { parseListPage } from '@/components/DesignManhole/ListPager';
import TagChips from '@/components/DesignManhole/TagChips';
import type { DesignManhole } from '@/types/database';

// 一覧（/design-manholes）と同じ理由で、常にサーバーレンダリングして Data Cache に乗せない
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const PAGE_SIZE = 48;

type PageProps = { params: { slug: string }; searchParams?: { page?: string | string[] } };

/** 見出し。「野球のマンホール」のように名前がもう「マンホール」で終わるものには重ねない */
function headingOf(group: DesignManholeTagGroup): string {
  return group.name.endsWith('マンホール') ? `${group.name}の写真` : `${group.name}のマンホール写真`;
}

function descriptionOf(group: DesignManholeTagGroup, photos: number): string {
  const lead = `みんなが撮った${group.name.endsWith('マンホール') ? group.name : `${group.name}のマンホール`}の写真${photos}枚。`;
  return group.kind === 'catalog' && group.spots
    ? `${lead}全国${group.spots}か所の設置場所のうち、写真が投稿された場所を紹介。まだ写真の無い場所の1枚も投稿できます。`
    : `${lead}ポケふた写真館のデザインマンホール投稿から集めました。見つけた1枚も投稿できます。`;
}

/** このタグの公開中の投稿（新しい順）と、チップ。タグが無い・写真が1枚も無ければ null */
async function loadTagPage(slug: string) {
  if (!isValidTagSlug(slug)) return null;
  const [designManholes, tagData] = await Promise.all([loadPublishedDesignManholes(), loadDesignManholeTagData()]);
  const group = tagData.groups.find((item) => item.slug === slug);
  if (!group) return null;
  const items = designManholes.filter((dm) => (tagData.tagsByPost[dm.id] ?? []).includes(slug));
  if (items.length === 0) return null;
  const chips = buildTagChips(tagData, designManholes.map((dm) => dm.id));
  return { group, items, chips, tagData, total: designManholes.length };
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const page = parseListPage(searchParams?.page) ?? 1;
  const loaded = await loadTagPage(params.slug).catch(() => null);
  if (!loaded) return { title: `デザインマンホール | ${SITE_NAME}` };
  const { group, items } = loaded;
  const heading = headingOf(group);
  const title = `${heading}${page > 1 ? `（${page}ページ目）` : ''} | ${SITE_NAME}`;
  const description = descriptionOf(group, items.length);
  const canonical = `${SITE_URL}${tagHref(group.slug, page)}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      images: [{ url: OGP_IMAGE_URL, width: 1200, height: 630, alt: heading }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OGP_IMAGE_URL] },
  };
}

export default async function DesignManholeTagPage({ params, searchParams }: PageProps) {
  const page = parseListPage(searchParams?.page);
  if (page === null) notFound();

  let loaded: Awaited<ReturnType<typeof loadTagPage>>;
  try {
    loaded = await loadTagPage(params.slug);
  } catch (error) {
    console.error('Failed to load design manholes for tag page:', error);
    return (
      <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
        <main className="mx-auto max-w-page px-4 pb-8 pt-5 sm:pt-8 lg:px-8">
          <p className="rounded-lg border border-[#B5483C]/30 bg-[#B5483C]/10 p-3 text-sm text-[#B5483C]">
            一覧の取得に失敗しました。時間をおいて再度お試しください。
          </p>
        </main>
      </div>
    );
  }
  if (!loaded) notFound();
  const { group, items, chips, tagData, total } = loaded;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (page > totalPages) notFound();
  const pageItems: DesignManhole[] = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const posterPublicIds = await Promise.all(pageItems.map((dm) => loadDesignManholeSubmitterPublicIdCached(dm.id)));

  const heading = headingOf(group);
  const parent = group.parent ? chips.find((chip) => chip.group.slug === group.parent) : undefined;
  const related = relatedChips(chips, group.slug);
  const hasProgress = group.kind === 'catalog' && group.spots !== null && group.spots > 0 && group.spotsWithPhoto !== null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: heading,
    description: descriptionOf(group, items.length),
    url: `${SITE_URL}${tagHref(group.slug)}`,
    numberOfItems: items.length,
    itemListElement: pageItems.slice(0, 30).map((dm, index) => ({
      '@type': 'ListItem',
      position: (page - 1) * PAGE_SIZE + index + 1,
      name: dm.title || 'デザインマンホール',
      url: `${SITE_URL}/design-manholes/${dm.id}`,
    })),
  };

  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <script
        type="application/ld+json"
        // title はユーザー入力なので、</script> 挿入によるXSSを防ぐため < をエスケープする
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <main className="mx-auto max-w-page px-4 pb-8 pt-5 sm:pt-8 lg:px-8">
        <nav aria-label="パンくず" className="flex flex-wrap items-center gap-x-3 text-sm font-bold text-dm-line">
          <Link href="/design-manholes" className="inline-flex items-center gap-0.5 hover:underline">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            みんなのデザインマンホール（{total}枚）
          </Link>
          {parent && (
            <Link href={tagHref(parent.group.slug)} className="inline-flex items-center gap-0.5 hover:underline">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {parent.group.label}
            </Link>
          )}
        </nav>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold sm:text-xl">{heading}</h1>
            <p className="mt-2 text-sm font-bold text-dm-ink">
              いま <span className="text-base">{items.length}</span> 枚集まっています
            </p>
          </div>
          <SubmitCta
            surface="design_manhole_list_toolbar"
            className="flex items-center gap-1.5 rounded-lg bg-dm-line px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
          />
        </div>

        {(hasProgress || group.guideUrl) && (
          <section className="mt-4 rounded-lg border border-dm-line/15 bg-white/70 p-4">
            {hasProgress && (
              <>
                <p className="text-sm">
                  全国{group.spots}か所のうち、写真が投稿されているのは
                  <span className="font-bold">{group.spotsWithPhoto}か所</span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-dm-line/10" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-dm-line"
                    style={{ width: `${Math.min(100, Math.round((group.spotsWithPhoto! / group.spots!) * 100))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-[#2A2A2A]/60">
                  まだ写真の無い場所で見つけたら、ぜひ投稿してください。
                </p>
              </>
            )}
            {group.guideUrl && (
              <a
                href={group.guideUrl}
                className={`${hasProgress ? 'mt-3 ' : ''}inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-bold text-dm-line ring-1 ring-dm-line/30 transition hover:bg-[#F3EEFA]`}
              >
                {group.name}のマンホールの設置場所を図鑑で見る
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </section>
        )}

        {related.length > 0 && (
          <div className="mt-4">
            <TagChips chips={related} current={group.slug} label={`${parent?.group.label ?? group.label}のタグ`} />
          </div>
        )}

        <ul id="list" className="mt-4 grid scroll-mt-20 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
          {pageItems.map((dm, index) => (
            <li key={dm.id}>
              <DesignManholeCard
                designManhole={dm}
                posterPublicId={posterPublicIds[index] ?? null}
                eager={index < 6}
                // タグは一覧と同じくいつも出す（このページのタグでも）
                tags={cardTags(tagData, dm.id)}
              />
            </li>
          ))}
        </ul>
        <ListPager page={page} totalPages={totalPages} hrefFor={(n) => tagHref(group.slug, n)} />
      </main>
    </div>
  );
}
