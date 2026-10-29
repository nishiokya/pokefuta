import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Camera,
  Instagram,
  Map as MapIcon,
  MapPin,
  Search,
  Sparkles,
  Stamp,
} from 'lucide-react';
import Breadcrumb from '@/components/Breadcrumb';
import LandscapePhotoBadge from '@/components/LandscapePhotoBadge';
import AiPhotoTags from '@/components/AiPhotoTags';
import AiTagNote from '@/components/AiTagNote';
import { isPlushPhoto, photoAiTags, photoObjectPosition } from '@/lib/photo-ai-tags';
import GuestOnly from '@/components/users/GuestOnly';
import CollectionStampShelf from '@/components/visits/CollectionStampShelf';
import MonthlyActivity, { buildMonthlyActivity } from '@/components/users/MonthlyActivity';
import StickerStrip from '@/components/visits/StickerStrip';
import { pokemonDexUrl } from '@/lib/pokemonSlug';
import { buildPublicStampbookBadges } from '@/lib/public-stampbook-badges';
import { loadPublicDesignManholeCount } from '@/lib/design-manhole-submitter';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import { fetchPokemonRepresentatives } from '@/lib/pokemon-representatives';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { formatDateJa } from '@/lib/date';
import { INSTAGRAM_HOSTS, X_HOSTS, safeSocialUrl } from '@/lib/social-url';
import PokemonGoFriendCard from '@/components/users/PokemonGoFriendCard';
import XLogo from '@/components/XLogo';
import UserRegularBadge from '@/components/users/UserRegularBadge';
import HeroStat, { rankRing } from '@/components/users/HeroStat';
import TitleProgressStat from '@/components/users/TitleProgressStat';
import {
  FALLBACK_INSTALLED_PREFECTURE_COUNT,
  loadPublicUserPrefectureProgress,
} from '@/lib/user-prefecture-progress';
import { PublicVisit, loadPublicUserVisits } from '@/lib/user-public-visits';
import { DEX_MAP_URL } from '@/lib/prefectureSlug';

type PageProps = {
  params: {
    userId: string;
  };
};

export const dynamic = 'force-dynamic';
// ここに `fetchCache = 'force-no-store'` は置かない。
//
// `dynamic = 'force-dynamic'` はページを毎回レンダリングするだけで、
// **その中の fetch は Next.js の Data Cache に載ったままになる**
// （`.next/cache/fetch-cache` はビルドやプロセス再起動をまたいで残る）。
// そのため募集スイッチを OFF にしてもトレーナーコードが描画され続けていた。
//
// ただしルート単位で no-store にすると、500件の訪問取得もマンホールカタログも
// 巻き添えで毎回DB直撃になる。ここは SEO 流入の入口なので割に合わない。
// 代わりに取得ごとに分けてある（`getPublicProfileClient` / `getPublicCatalogClient`）。
// 即時反映が要るのはプロフィールRPCだけで、訪問一覧は数分遅れて構わない。

const getPageUrl = (userId: string) => `${SITE_URL}/users/${encodeURIComponent(userId)}/visits`;
// OGP 画像のキャッシュキー。この画像だけの版にして、中身を変えたら上げる（共通の OGP_IMAGE_VERSION は他のページも巻き込む）
// 20261028: 称号・3つの輪・バッジのメダル・ステッカーをページと同じ見た目で載せた
const STAMPBOOK_OGP_VERSION = '20261028-stampbook-card';
const getOgpImageUrl = (userId: string) =>
  `${getPageUrl(userId)}/opengraph-image?v=${STAMPBOOK_OGP_VERSION}`;

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
    // 公開訪問が0件のページは表示名と bio しか無い。200 で見せはするが、
    // 薄いページを検索資産として増やさない。公開訪問が1件でも入れば通常の方針に戻る。
    // follow は残す（本人が貼ったSNSリンクを辿れなくする理由が無い）。
    ...(data.totalVisits === 0
      ? { robots: { index: false, follow: true } }
      : {}),
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
  const [data, progress, snapshot, representatives, designManholeCount] = await Promise.all([
    loadPublicUserVisits(params.userId),
    loadPublicUserPrefectureProgress(params.userId).catch(() => null),
    // ステッカーの判定に蓋のテーマ（hashtags）が要る。スナップショットは1時間キャッシュされる
    fetchManholeSnapshot().catch(() => null),
    fetchPokemonRepresentatives(),
    loadPublicDesignManholeCount(params.userId),
  ]);

  if (!data) notFound();

  // 都道府県・ポケモンのバッジ（金・銀・銅）とステッカー。OGP 画像と同じ組み立て
  const badges = (() => {
    if (!progress) return null;
    const built = buildPublicStampbookBadges({ userId: data.userId, progress, snapshot, representatives, designManholeCount, plushCount: data.visits.filter((v) => isPlushPhoto(v.aiTags)).length });
    return { ...built, pokemon: built.pokemon.map((p) => ({ ...p, href: pokemonDexUrl(p.name) })) };
  })();

  // プロフィール編集は/profile にあり（自分のスタンプ帳 /visits からも行ける）、この公開ページは表示専用
  const xUrl = safeSocialUrl(data.xUrl, X_HOSTS);
  const instagramUrl = safeSocialUrl(data.instagramUrl, INSTAGRAM_HOSTS);

  const pageUrl = getPageUrl(data.userId);
  const totalPrefectures = progress?.totalPrefectureCount || FALLBACK_INSTALLED_PREFECTURE_COUNT;
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
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <script
        type="application/ld+json"
        // displayName はユーザー入力なので、</script> 挿入によるXSSを防ぐため < をエスケープする
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <main className="mx-auto max-w-page px-4 lg:px-8 pb-8 pt-3 sm:pt-6">
        {/* ヘッダーのロゴはサイト切り替えのボタンで、ナビにもホームが無い。共有リンクから着いた人がトップへ戻る見える道はこれだけなので残す */}
        <Breadcrumb href="/" label="ホームへ" />
        <section className="relative overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-4 py-4 shadow-[0_12px_30px_rgba(95,68,42,0.13)] sm:px-8 sm:py-6">
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative">
            {/*
              共有ボタンは置かない。押すのはほぼ持ち主本人（他人のページはまず共有しない）で、
              本人用はスタンプ帳(/visits)のトレーナー情報にある。ここに置くと持ち主の X へのリンクと
              黒い「X」が2つ並んで紛らわしかった
            */}
            {/*
              「公開スタンプ帳」の札は外した（URL と見出しで分かる）。称号（🏆 LEGEND など）は名前の前に置いて1行を節約する。
              PC はポケモンGOのフレンド募集を右のカードに置き、スマホ・タブレットは名前の下に横長で出す
            */}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
              <div className="min-w-0">
                {/* 本人の X・Instagram は名前の横にロゴだけで置く。名前が長くて入らなければ下へ回る */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <UserRegularBadge userId={data.userId} />
                  <h1 className="text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl lg:text-4xl">
                    {data.displayName}のスタンプ帳
                  </h1>
                  {(xUrl || instagramUrl) && (
                    <div className="flex gap-2">
                      {xUrl && <SocialLink href={xUrl} label="X" icon={<XLogo className="h-4 w-4" />} />}
                      {instagramUrl && (
                        <SocialLink href={instagramUrl} label="Instagram" icon={<Instagram className="h-4 w-4" />} />
                      )}
                    </div>
                  )}
                </div>
                {data.bio && (
                  <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-[#6A4D36] sm:text-base">
                    {data.bio}
                  </p>
                )}
                <p className={`${data.bio ? 'mt-1' : 'mt-3'} max-w-2xl text-xs font-medium leading-5 text-[#6A4D36]/80 sm:text-sm`}>
                  公開設定の訪問記録のみを表示しています。
                </p>
              </div>

              {data.pokemonGoFriendCode && (
                <div className="mt-4 lg:mt-0">
                  <PokemonGoFriendCard
                    code={data.pokemonGoFriendCode}
                    note={data.pokemonGoFriendNote}
                    displayName={data.displayName}
                  />
                </div>
              )}
            </div>

            {/*
              「訪問したポケふた／訪れた都道府県／出会ったポケモンたち」を、それぞれ集めた割合の輪（円グラフ）で並べる。
              ポケふたは別のふたの数（再訪は数えない）で、輪は今の称号の色で次の称号まで（LEGEND は全国の何割か）。
              都道府県・ポケモンは輪をバッジと同じ金・銀・銅の色にして、次の段まであと何かを下に。
              progress が取れなければ訪問の件数と都道府県だけ
            */}
            <div className={`mt-4 grid gap-2 sm:gap-3 lg:mt-5 ${progress ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {progress ? (
                <TitleProgressStat
                  visited={progress.visitedManholeCount}
                  totalManholes={progress.totalManholeCount}
                />
              ) : (
                <HeroStat id="visits" label={['訪問した', 'ポケふた']} value={data.totalVisits} />
              )}
              <HeroStat
                id="prefectures"
                label={['訪れた', '都道府県']}
                value={data.prefectureCount}
                {...rankRing(data.prefectureCount, totalPrefectures, '県')}
              />
              {progress && (
                <HeroStat
                  id="pokemon"
                  label={['出会った', 'ポケモンたち']}
                  value={progress.pokedex.collected}
                  {...rankRing(progress.pokedex.collected, progress.pokedex.total, '種')}
                />
              )}
            </div>
          </div>
        </section>

        {/* 都道府県・ポケモンのバッジ（金・銀・銅のメダル）とステッカー */}
        {badges && (badges.prefectures.length > 0 || badges.pokemon.length > 0 || badges.stickers.length > 0) && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
                <Sparkles className="h-5 w-5 text-[#7B63A8]" />
                バッジ
              </h2>
              <Link href="/badges" className="font-pixelJp text-xs font-bold text-[#B5483C]">トレーナーカードとは ›</Link>
            </div>
            <div className="flex flex-col gap-6 rounded-[10px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-3 py-5 shadow-sm sm:px-5">
              {badges.prefectures.length > 0 && <CollectionStampShelf title="都道府県バッジ" items={badges.prefectures} />}
              {badges.pokemon.length > 0 && <CollectionStampShelf title="ポケモンバッジ" initialCount={16} items={badges.pokemon} />}
              <StickerStrip stickers={badges.stickers} />
            </div>
          </section>
        )}

        {/* バッジと訪問の一覧のあいだに、いつ回っていたか（年 × 月のマス） */}
        <MonthlyActivity
          years={buildMonthlyActivity(data.visits.map((v) => v.shotAt ?? v.createdAt))}
          truncated={data.isTruncated}
        />

        {/* 訪問の一覧。並びが分かるよう見出しと説明を置く（県ごとの塊が続くだけで、何の順か分からなかった） */}
        {data.visits.length > 0 && (
          <div className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
              <Camera className="h-5 w-5 text-[#B5483C]" />
              訪問したポケふた
              {/* 上の欄はふたの数なので、再訪も含めた訪問の件数はここに出す */}
              <span className="text-sm font-bold text-[#8C6A4A]">{data.totalVisits}件</span>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#6A4D36]">
              都道府県ごとにまとめ、最近訪問した県から並べています。県の中は撮影日の新しい順です。
              {data.isTruncated && `（最新500件を表示しています。全${data.totalVisits}件）`}
            </p>
          </div>
        )}

        {/* 県へ飛ぶナビ。中身は下の県見出し（県名・枚数）と同じなので、見渡せる PC では出さない。スマホは横スクロールの1行に収める（40県を超えると折り返しで10行になった） */}
        {prefectureGroups.length > 1 && (
          <nav aria-label="都道府県で移動" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
            {prefectureGroups.map((group) => (
              <a
                key={group.name}
                href={`#pref-${group.name}`}
                className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-full border border-[#8C6A4A]/25 bg-white/70 px-3 py-1.5 text-xs font-bold text-[#4F3828] transition hover:border-[#B5483C]/40 hover:bg-[#F8D9C4] hover:text-[#B5483C]"
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
            <section key={group.name} id={`pref-${group.name}`} className="mt-6 scroll-mt-20 sm:mt-8">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
                  <MapPin className="h-5 w-5 text-[#B5483C]" />
                  {group.name}
                </h2>
                <p className="text-xs font-bold text-[#6A4D36]">{group.visits.length}枚</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5 xl:grid-cols-6">
                {group.visits.map((visit) => (
                  <VisitCard key={visit.id} visit={visit} />
                ))}
              </div>
            </section>
          ))
        )}
        <AiTagNote
          className="mt-4"
          show={prefectureGroups.some((group) =>
            group.visits.some((visit) => photoAiTags({ ai_tags: visit.aiTags, is_landscape: visit.isLandscape }).length > 0))}
        />

        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
            <Sparkles className="h-5 w-5 text-[#B5483C]" />
            <GuestOnly fallback="次のポケふた旅へ">あなたもポケふた旅へ</GuestOnly>
          </h2>
          {/* 枚数はログイン状態で2〜3枚に変わるので、列数を決め打ちせず並んだ枚数で等分する */}
          <div className="grid gap-3 sm:auto-cols-fr sm:grid-flow-col">
            {/* ログイン中の人（持ち主本人を含む）はもうスタンプ帳を持っている */}
            <GuestOnly>
              <CtaCard
                href="/visits"
                icon={<Stamp className="h-5 w-5" />}
                title="自分のスタンプ帳を作る"
                description="無料ではじめて訪問を記録・公開しよう"
                highlight
              />
            </GuestOnly>
            <CtaCard
              href="/nearby"
              icon={<Search className="h-5 w-5" />}
              title="近くのポケふたを探す"
              description="現在地から近い順に見つけられます"
            />
            <CtaCard
              href={DEX_MAP_URL}
              icon={<MapIcon className="h-5 w-5" />}
              title="全国マップで見る"
              description="都道府県ごとの設置状況をチェック"
            />
          </div>
        </section>
      </main>

    </div>
  );
}

// ロゴだけの丸いボタン。以前は「X」の文字のロゴの横に「X」の名前も付けていて「X x」に見えた
function SocialLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#8C6A4A]/25 bg-white/75 text-[#4F3828] transition hover:border-[#B5483C]/40 hover:bg-[#F8D9C4] hover:text-[#B5483C]"
    >
      {icon}
    </a>
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
  // タイトルはたいてい「愛知県/豊橋市」で、場所の行と同じことを2回言う。そのときは場所の行を出さない
  const municipality = visit.manhole?.municipality;
  const locationLabel = municipality && title.includes(municipality)
    ? ''
    : [visit.manhole?.prefecture, municipality].filter(Boolean).join(' ');

  const card = (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-[#E9DEC9] sm:aspect-[4/3]">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            style={{ objectPosition: photoObjectPosition(visit.aiTags) }}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#8C6A4A]">
            <Camera className="h-8 w-8 opacity-60" />
          </div>
        )}
      </div>
      <div className="p-1.5 sm:p-2.5">
        <div className="flex flex-wrap gap-1">
          <LandscapePhotoBadge isLandscape={visit.isLandscape} />
          <AiPhotoTags photo={{ ai_tags: visit.aiTags, is_landscape: visit.isLandscape }} />
        </div>
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
          <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-[#6A4D36] sm:line-clamp-2">
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
    <Link href={`/manhole/${visit.manholeId}`} className="block h-full">
      {card}
    </Link>
  );
}
