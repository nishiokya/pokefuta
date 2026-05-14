'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Compass,
  Heart,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type FeedVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'title' | 'pokemons'> | null;
  shot_at: string;
  created_at: string;
  shot_location?: string | null;
  photos: Array<{
    id: string;
    thumbnail_url?: string;
  }>;
  likes_count: number;
  comments_count: number;
};

type GalleryTab = 'latest';

const galleryTabs: Array<{ key: GalleryTab | 'prefectures'; label: string; mobileLabel: string }> = [
  { key: 'latest', label: '最新', mobileLabel: '最新' },
  { key: 'prefectures', label: '都道府県から探す', mobileLabel: '探す' },
];

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalManholes, setTotalManholes] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [manholesWithPhotos, setManholesWithPhotos] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<GalleryTab>('latest');
  const feedPerPage = 24;
  const { trackView } = useAnalytics();

  useEffect(() => {
    // ページタイトル設定
    document.title = 'ポケふた写真館 - ポケふた訪問記録';

    // ✅ GA: ページビュー追跡
    trackView('/', 'ホーム', 'home');

    // ログイン状態はSupabase sessionで判定（APIは常に公開フィードを使う）
    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setIsLoggedIn(Boolean(session?.user));
      } catch {
        setIsLoggedIn(false);
      }
    })();

    loadSiteStats();
  }, []);

  useEffect(() => {
    loadFeed();
  }, [currentPage]);

  const loadFeed = async () => {
    try {
      const offset = (currentPage - 1) * feedPerPage;
      const response = await fetch(
        `/api/visits?with_photos=true&limit=${feedPerPage}&offset=${offset}&order_by=created_at`,
        { credentials: 'omit' }
      );
      if (!response.ok) throw new Error('Failed to load feed');
      const data = await response.json();
      if (!data?.success) throw new Error('Feed response was not success');

      const visits: FeedVisit[] = Array.isArray(data.visits) ? data.visits : [];
      setFeed(visits);
    } catch (error) {
      console.error('Failed to load feed:', error);
      setFeed([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSiteStats = async () => {
    try {
      const response = await fetch('/api/site-stats');
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.success) return;
      // トップからユーザ数は基本的に外す（必要なら後で小さく出す）
      setTotalUsers(typeof data.users === 'number' ? data.users : null);
      setTotalPosts(typeof data.posts === 'number' ? data.posts : null);
      if (typeof data.manholes === 'number') setTotalManholes(data.manholes);
      setManholesWithPhotos(
        typeof data.manholes_with_photos === 'number' ? data.manholes_with_photos : null
      );
    } catch {
      // ignore
    }
  };

  const sortedFeed = [...feed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const visibleFeed =
    sortedFeed.length > 1 && sortedFeed.length % 2 === 1 ? sortedFeed.slice(0, -1) : sortedFeed;
  const listedCount = totalPosts && totalPosts > 0 ? totalPosts : 470;
  const totalFeedCount = totalPosts && totalPosts > 0 ? totalPosts : null;
  const totalPages = totalFeedCount ? Math.max(1, Math.ceil(totalFeedCount / feedPerPage)) : null;
  const canGoNext = totalPages ? currentPage < totalPages : feed.length === feedPerPage;
  const showPagination = totalPages ? totalPages > 1 : currentPage > 1 || feed.length === feedPerPage;
  const uploadHref = isLoggedIn ? '/upload' : '/login?redirect=/upload';

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <header className="sticky top-0 z-30 border-b border-[#7B63A8]/20 bg-[#FFF8EB]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold" aria-label="ポケふた写真館">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#2A2A2A] bg-white shadow-sm">
              <span className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-[#E85046]" />
              <span className="absolute inset-x-0 top-1/2 h-[2px] bg-[#2A2A2A]" />
              <span className="relative h-3 w-3 rounded-full border-2 border-[#2A2A2A] bg-white" />
            </span>
            <span className="text-base sm:text-lg">ポケふた写真館</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="検索"
              title="検索"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="絞り込み"
              title="絞り込み"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            <Link
              href={uploadHref}
              className="hidden items-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299] sm:flex"
            >
              <Camera className="h-4 w-4" />
              写真を投稿
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10 sm:hidden"
              aria-label="メニュー"
              title="メニュー"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-6 pt-5 sm:pt-8">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="font-bold text-[#7B63A8]">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <>
            <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-8 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-10 sm:py-12">
              <div className="absolute right-6 top-7 hidden w-[300px] rotate-2 overflow-hidden rounded-[8px] border border-[#E2CFAE] bg-white p-2 shadow-lg lg:block xl:w-[360px]">
                <img
                  src="/pokefuta_photo_gallery_mockup.svg"
                  alt=""
                  className="h-[220px] w-full rounded-[6px] object-cover object-left-top xl:h-[250px]"
                />
              </div>
              <div className="relative max-w-3xl lg:max-w-[680px]">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
                  <Sparkles className="h-3.5 w-3.5" />
                  旅行スタンプ帳
                </div>
                <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-normal sm:text-5xl">
                  旅先で見つけたポケふたを記録しよう
                </h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed sm:text-lg">
                  旅行やお出かけで出会ったポケふた写真をみんなでシェアしよう！
                </p>

                <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-4 shadow-sm">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#7B63A8] shadow-sm">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-xl font-extrabold leading-none">全国387自治体</div>
                      <div className="mt-1 text-xs font-bold text-[#6B6B6B]">に設置</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-4 shadow-sm">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#FF8F1F] shadow-sm">
                      <Compass className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-xl font-extrabold leading-none">{listedCount}枚以上</div>
                      <div className="mt-1 text-xs font-bold text-[#6B6B6B]">のポケふたを掲載</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6">
              <div className="-mx-4 overflow-x-auto px-4 pb-1">
                <div className="flex min-w-max gap-2 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB]/80 p-1 shadow-sm sm:min-w-0">
                  {galleryTabs.map((tab) => {
                    if (tab.key === 'prefectures') {
                      return (
                        <Link
                          key={tab.key}
                          href="/manholes"
                          className="flex min-h-[44px] items-center justify-center gap-2 rounded-[7px] px-5 text-sm font-bold text-[#2A2A2A] transition hover:bg-white"
                        >
                          <span className="hidden sm:inline">{tab.label}</span>
                          <span className="sm:hidden">{tab.mobileLabel}</span>
                          <MapPin className="h-4 w-4" />
                        </Link>
                      );
                    }

                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key as GalleryTab)}
                        className={`min-h-[44px] rounded-[7px] px-5 text-sm font-bold transition ${
                          isActive
                            ? 'bg-[#7B63A8] text-white shadow-sm'
                            : 'text-[#2A2A2A] hover:bg-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mt-6">
              {visibleFeed.length === 0 ? (
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
                  <p className="text-sm font-bold text-[#6B6B6B]">
                    まだ投稿がありません
                  </p>
                  <Link
                    href={uploadHref}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isLoggedIn ? '写真を投稿' : 'ログインして投稿'}</span>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
                  {visibleFeed.map((visit, index) => {
                    const photo = visit.photos?.[0];
                    const title = [visit.manhole?.prefecture, visit.manhole?.municipality]
                      .filter(Boolean)
                      .join(' ');
                    const locationLabel = title || visit.shot_location || '';
                    const manholeId = visit.manhole?.id ?? visit.manhole_id;
                    const canNavigate = Boolean(manholeId);
                    const to = canNavigate ? `/manhole/${manholeId}` : '';

                    const commonAriaLabel = `${locationLabel}、撮影 ${formatDateJa(visit.shot_at)}、いいね ${visit.likes_count}、コメント ${visit.comments_count}`;
                    const cardContent = (
                      <>
                        {photo?.thumbnail_url ? (
                          <img
                            src={photo.thumbnail_url}
                            alt=""
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#FFF8EB] text-[#7B63A8]">
                            <MapPin className="h-8 w-8 opacity-80" />
                          </div>
                        )}

                        {index < 3 && (
                          <span className="absolute left-2 top-2 rounded-[6px] bg-[#7B63A8] px-2 py-1 text-xs font-extrabold text-white shadow-sm">
                            NEW
                          </span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-14 text-white sm:p-4 sm:pt-20">
                          <div className="line-clamp-1 text-sm font-extrabold sm:text-base">
                            {locationLabel || 'ポケふた'}
                          </div>
                          <div className="mt-1 text-sm font-semibold">{formatDateJa(visit.shot_at)}</div>
                          <div className="mt-3 flex items-center gap-4 text-sm font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <Heart className="h-4 w-4" />
                              {visit.likes_count}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle className="h-4 w-4" />
                              {visit.comments_count}
                            </span>
                          </div>
                        </div>
                      </>
                    );

                    if (!canNavigate) {
                      if (process.env.NODE_ENV !== 'production') {
                        console.warn('Home feed item missing manholeId; navigation disabled', {
                          visitId: visit.id,
                          manhole_id: visit.manhole_id,
                        });
                      }

                      return (
                        <div
                          key={visit.id}
                          className="group relative aspect-square overflow-hidden rounded-[8px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15"
                          aria-label={commonAriaLabel}
                        >
                          {cardContent}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={visit.id}
                        href={to}
                        className="group relative aspect-square overflow-hidden rounded-[8px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
                        aria-label={commonAriaLabel}
                      >
                        {cardContent}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="sr-only" aria-live="polite">
              全ポケふた {totalManholes || 0}、写真あり {manholesWithPhotos ?? 0}、全投稿{' '}
              {totalPosts ?? 0}
              {/* ユーザ数はここに退避したい場合に使えるが、デフォルトでは表示しない */}
              {false && (
                <span>ユーザ {totalUsers ?? '—'}</span>
              )}
            </div>

            {/* Feed Pagination */}
            {showPagination && (
              <div className="mb-32 mt-7 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-3 shadow-sm sm:mb-0">
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex min-h-11 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#FFB347]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="前のページ"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    前へ
                  </button>

                  <div className="min-w-16 text-center text-sm font-bold text-[#6B6B6B]">
                    {totalPages ? `${currentPage} / ${totalPages}` : currentPage}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    disabled={!canGoNext}
                    className="flex min-h-11 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#FFB347]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="次のページ"
                  >
                    次へ
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </main>

      <Link
        href={uploadHref}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#7B63A8] px-5 py-4 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(123,99,168,0.30)] transition hover:bg-[#6A5299] sm:bottom-6 sm:right-6"
      >
        <Camera className="h-5 w-5" />
        写真を投稿
      </Link>

      <BottomNav />
    </div>
  );
}
