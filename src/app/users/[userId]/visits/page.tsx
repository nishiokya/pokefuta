import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ExternalLink,
  Instagram,
  Map as MapIcon,
  MapPin,
  Search,
  Sparkles,
  Stamp,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import ShareButtons from '@/components/ShareButtons';
import PublicProfileEditor from '@/components/users/PublicProfileEditor';
import { OGP_IMAGE_VERSION, SITE_NAME, SITE_URL } from '@/lib/constants';
import { formatDateJa } from '@/lib/date';
import { userVisitsShareText } from '@/lib/share';
import { loadPublicUserPrefectureProgress } from '@/lib/user-prefecture-progress';
import { PublicVisit, loadPublicUserVisits } from '@/lib/user-public-visits';
import { createServerClient } from '@/lib/supabase/server';

type PageProps = {
  params: {
    userId: string;
  };
};

export const dynamic = 'force-dynamic';

const getPageUrl = (userId: string) => `${SITE_URL}/users/${encodeURIComponent(userId)}/visits`;
const getOgpImageUrl = (userId: string) =>
  `${getPageUrl(userId)}/opengraph-image?v=${OGP_IMAGE_VERSION}`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await loadPublicUserVisits(params.userId);

  if (!data) {
    return {
      title: `スタンプ帳が見つかりません | ${SITE_NAME}`,
    };
  }

  const pageUrl = getPageUrl(data.userId);
  const ogpImageUrl = getOgpImageUrl(data.userId);
  const title = `${data.displayName}のスタンプ帳 | ${SITE_NAME}`;
  const description = `${data.displayName}さんが公開している訪問記録${data.totalVisits}件、${data.prefectureCount}都道府県分のポケふたスタンプ帳です。`;

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
      type: 'profile',
      images: [
        {
          url: ogpImageUrl,
          width: 1200,
          height: 630,
          alt: `${data.displayName}のポケふたスタンプ帳`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogpImageUrl],
    },
  };
}

type PrefectureGroup = {
  name: string;
  visits: PublicVisit[];
};

// 訪問は shot_at 降順で来るので、挿入順 = 直近に訪れた都道府県が先頭になる
function groupVisitsByPrefecture(visits: PublicVisit[]): PrefectureGroup[] {
  const groups = new Map<string, PublicVisit[]>();
  visits.forEach((visit) => {
    const name = visit.manhole?.prefecture || 'その他';
    const list = groups.get(name);
    if (list) {
      list.push(visit);
    } else {
      groups.set(name, [visit]);
    }
  });
  return Array.from(groups.entries()).map(([name, groupVisits]) => ({
    name,
    visits: groupVisits,
  }));
}

export default async function UserVisitsPage({ params }: PageProps) {
  const [data, progress, authResult] = await Promise.all([
    loadPublicUserVisits(params.userId),
    loadPublicUserPrefectureProgress(params.userId).catch(() => null),
    createServerClient().auth.getUser(),
  ]);

  if (!data) notFound();
  const isOwner = authResult.data.user?.id === data.authUid;
  const xUrl = safeSocialUrl(data.xUrl, ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
  const instagramUrl = safeSocialUrl(data.instagramUrl, ['instagram.com', 'www.instagram.com']);

  const pageUrl = getPageUrl(data.userId);
  const shareText = userVisitsShareText(data.displayName, data.totalVisits, data.prefectureCount);
  const totalPrefectures = progress?.totalPrefectureCount || 47;
  const completionRate = progress ? Math.min(progress.completionRate, 100) : null;
  // 0% のときに 1.5% 埋まって見えないよう、進捗があるときだけ最小幅を適用
  const barWidthPercent = completionRate ? Math.max(completionRate, 1.5) : 0;
  const remainingCount = progress
    ? Math.max(progress.totalManholeCount - progress.visitedManholeCount, 0)
    : null;
  const prefectureGroups = groupVisitsByPrefecture(data.visits);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${data.displayName}のスタンプ帳`,
    url: pageUrl,
    mainEntity: {
      '@type': 'Person',
      name: data.displayName,
    },
  };

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <script
        type="application/ld+json"
        // displayName はユーザー入力なので、</script> 挿入によるXSSを防ぐため < をエスケープする
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Header
        title={SITE_NAME}
        actions={
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#4F3828]">
            <ArrowLeft className="h-4 w-4" />
            ホームへ
          </Link>
        }
      />

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:pt-8">
        <section className="relative overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-5 py-6 shadow-[0_12px_30px_rgba(95,68,42,0.13)] sm:px-8 sm:py-8">
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#B5483C]/25 bg-[#F8D9C4] px-3 py-1 text-xs font-bold text-[#B5483C]">
              <Stamp className="h-3.5 w-3.5" />
              公開スタンプ帳
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
              {data.displayName}のスタンプ帳
            </h1>
            {data.bio && (
              <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-[#6A4D36] sm:text-base">
                {data.bio}
              </p>
            )}
            <p className={`${data.bio ? 'mt-1' : 'mt-3'} max-w-2xl text-xs font-medium leading-5 text-[#6A4D36]/80 sm:text-sm`}>
              公開設定の訪問記録のみを表示しています。
            </p>

            {(xUrl || instagramUrl) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {xUrl && <SocialLink href={xUrl} label="X" icon={<span className="text-sm font-black">X</span>} />}
                {instagramUrl && <SocialLink href={instagramUrl} label="Instagram" icon={<Instagram className="h-4 w-4" />} />}
              </div>
            )}

            {isOwner && (
              <PublicProfileEditor
                displayName={data.editableDisplayName}
                bio={data.bio}
                xUrl={data.xUrl}
                instagramUrl={data.instagramUrl}
              />
            )}

            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
              <HeroStat label="訪問スタンプ" value={`${data.totalVisits}`} />
              <HeroStat label="都道府県" value={`${data.prefectureCount}/${totalPrefectures}`} />
              {completionRate !== null && (
                <HeroStat label="全国達成率" value={`${completionRate.toFixed(1)}%`} />
              )}
            </div>

            {completionRate !== null && (
              <div className="mt-4">
                <div className="h-3 w-full overflow-hidden rounded-full bg-[#8C6A4A]/20">
                  <div
                    className="h-full rounded-full bg-[#B5483C] transition-all"
                    style={{ width: `${barWidthPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-bold text-[#6A4D36]">
                  全国のポケふた制覇まであと{remainingCount}枚
                </p>
              </div>
            )}

            <div className="mt-6">
              <ShareButtons
                label="このスタンプ帳を自慢する"
                shareText={shareText}
                shareUrl={pageUrl}
                hashtags={['ポケふたスタンプ帳']}
              />
            </div>
          </div>
        </section>

        {data.isTruncated && (
          <p className="mt-4 text-xs font-bold text-[#6A4D36]">
            最新500件を表示しています（全{data.totalVisits}件）
          </p>
        )}

        {prefectureGroups.length > 1 && (
          <nav aria-label="都道府県で移動" className="mt-6 flex flex-wrap gap-2">
            {prefectureGroups.map((group) => (
              <a
                key={group.name}
                href={`#pref-${group.name}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#8C6A4A]/25 bg-white/70 px-3 py-1.5 text-xs font-bold text-[#4F3828] transition hover:border-[#B5483C]/40 hover:bg-[#F8D9C4] hover:text-[#B5483C]"
              >
                <MapPin className="h-3 w-3" />
                {group.name}
                <span className="text-[#B5483C]">{group.visits.length}</span>
              </a>
            ))}
          </nav>
        )}

        {data.visits.length === 0 ? (
          <section className="mt-6">
            <div className="rounded-[8px] border border-[#8C6A4A]/15 bg-white/70 px-5 py-10 text-center text-sm font-bold text-[#6A4D36]">
              公開中の訪問記録はまだありません。
            </div>
          </section>
        ) : (
          prefectureGroups.map((group) => (
            <section key={group.name} id={`pref-${group.name}`} className="mt-8 scroll-mt-20">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
                  <MapPin className="h-5 w-5 text-[#B5483C]" />
                  {group.name}
                </h2>
                <p className="text-xs font-bold text-[#6A4D36]">{group.visits.length}枚</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.visits.map((visit) => (
                  <VisitCard key={visit.id} visit={visit} />
                ))}
              </div>
            </section>
          ))
        )}

        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
            <Sparkles className="h-5 w-5 text-[#B5483C]" />
            あなたもポケふた旅へ
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CtaCard
              href="/visits"
              icon={<Stamp className="h-5 w-5" />}
              title="自分のスタンプ帳を作る"
              description="無料ではじめて訪問を記録・公開しよう"
              highlight
            />
            <CtaCard
              href="/nearby"
              icon={<Search className="h-5 w-5" />}
              title="近くのポケふたを探す"
              description="現在地から近い順に見つけられます"
            />
            <CtaCard
              href="/map"
              icon={<MapIcon className="h-5 w-5" />}
              title="全国マップで見る"
              description="都道府県ごとの設置状況をチェック"
            />
            <CtaCard
              href="/popular"
              icon={<Camera className="h-5 w-5" />}
              title="人気のポケふた"
              description="みんなが訪れているポケふたを見る"
            />
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#8C6A4A]/25 bg-white/75 px-3 py-1.5 text-xs font-extrabold text-[#4F3828] transition hover:bg-white">
      {icon}
      {label}
      <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}

function safeSocialUrl(value: string | null, allowedHosts: string[]) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-[#8C6A4A]/15 bg-white/70 px-4 py-3">
      <p className="text-[11px] font-extrabold text-[#6A4D36]">{label}</p>
      <p className="mt-1 font-pixel text-2xl leading-none text-[#B5483C]">{value}</p>
    </div>
  );
}

function CtaCard({
  href,
  icon,
  title,
  description,
  highlight = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-[8px] border px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        highlight
          ? 'border-[#B5483C]/35 bg-[#F8D9C4]'
          : 'border-[#8C6A4A]/20 bg-[#FFF7E5]'
      }`}
    >
      <div className={`flex items-center gap-2 font-extrabold ${highlight ? 'text-[#B5483C]' : 'text-[#4F3828]'}`}>
        {icon}
        <span className="text-sm leading-tight">{title}</span>
      </div>
      <p className="mt-2 flex-1 text-[11px] font-bold leading-snug text-[#6A4D36]">{description}</p>
      <span className={`mt-3 inline-flex items-center gap-1 text-[11px] font-extrabold ${highlight ? 'text-[#B5483C]' : 'text-[#8C6A4A]'}`}>
        ひらく
        <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function VisitCard({ visit }: { visit: PublicVisit }) {
  const photoId = visit.photoIds[0] || null;
  const photoUrl = photoId ? `/api/photo/${encodeURIComponent(photoId)}?size=small` : null;
  const title = visit.manhole?.title
    || [visit.manhole?.prefecture, visit.manhole?.municipality].filter(Boolean).join(' ')
    || 'ポケふた';
  const locationLabel = [visit.manhole?.prefecture, visit.manhole?.municipality].filter(Boolean).join(' ');

  const card = (
    <div className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative flex-1 overflow-hidden bg-[#E9DEC9]">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#8C6A4A]">
            <Camera className="h-8 w-8 opacity-60" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate font-pixelJp text-[12px] font-bold leading-tight text-[#4F3828]">
          {title}
        </p>
        {locationLabel && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-bold text-[#8C6A4A]">
            <MapPin className="h-3 w-3 shrink-0" />
            {locationLabel}
          </p>
        )}
        {visit.shotAt && (
          <p className="mt-1 text-[11px] font-semibold text-[#6A4D36]">
            {formatDateJa(visit.shotAt)}
          </p>
        )}
        {visit.comment && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#6A4D36]">
            {visit.comment}
          </p>
        )}
      </div>
    </div>
  );

  if (!visit.manholeId) {
    return card;
  }

  return (
    <Link href={`/manhole/${visit.manholeId}`} className="block">
      {card}
    </Link>
  );
}
