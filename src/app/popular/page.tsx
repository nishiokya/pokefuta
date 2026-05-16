'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  MessageCircle,
  Sparkles,
  TrendingUp,
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

export default function PopularPage() {
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const feedPerPage = 24;
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = 'みんなのポケふた旅 - ポケふた訪問記録';
    trackView('/popular', 'みんなのポケふた旅', 'popular');

    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setIsLoggedIn(Boolean(session?.user));
      } catch (error) {
        console.error('Session check error:', error);
        setIsLoggedIn(false);
      }
    })();

    loadSiteStats();
  }, []);

  useEffect(() => {
    loadFeed();
  }, [currentPage]);

  const loadFeed = async () => {
    setLoading(true);
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
      setTotalPosts(typeof data.posts === 'number' ? data.posts : null);
    } catch {
      // ignore
    }
  };

  const sortedFeed = [...feed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const visibleFeed =
    sortedFeed.length > 1 && sortedFeed.length % 2 === 1 ? sortedFeed.slice(0, -1) : sortedFeed;
  const totalFeedCount = totalPosts && totalPosts > 0 ? totalPosts : null;
  const totalPages = totalFeedCount ? Math.max(1, Math.ceil(totalFeedCount / feedPerPage)) : null;
  const canGoNext = totalPages ? currentPage < totalPages : feed.length === feedPerPage;
  const showPagination = totalPages ? totalPages > 1 : currentPage > 1 || feed.length === feedPerPage;

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <header className="sticky top-0 z-50 border-b border-[#7B63A8]/20 bg-[#FFF8EB]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold" aria-label="ホームに戻る">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#2A2A2A] bg-white shadow-sm">
              <span className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-[#E85046]" />
              <span className="absolute inset-x-0 top-1/2 h-[2px] bg-[#2A2A2A]" />
              <span className="relative h-3 w-3 rounded-full border-2 border-[#2A2A2A] bg-white" />
            </span>
            <span className="text-base sm:text-lg">みんなのポケふた旅</span>
          </Link>

          <div className="flex items-center gap-2">
            {!isLoggedIn && (
              <>
                <Link
                  href="/login"
                  className="rounded-lg border border-[#7B63A8] px-4 py-2 text-sm font-bold text-[#7B63A8] transition hover:bg-[#7B63A8]/10"
                >
                  ログイン
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-[#7B63A8] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                >
                  新規登録
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-6 pt-5 sm:pt-8">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-gradient-to-br from-[#FFF8EB] to-[#FFE6D5] px-5 py-8 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-10 sm:py-12">
          <div className="absolute right-6 top-6 opacity-20">
            <TrendingUp className="h-32 w-32 text-[#7B63A8]" />
          </div>
          <div className="relative max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
              <Sparkles className="h-3.5 w-3.5" />
              みんなのポケふた写真
            </div>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-normal sm:text-5xl">
              旅先で見つけたポケふたを眺めよう
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-[#6B6B6B] sm:text-lg">
              全国のユーザーが記録した写真から、次に行きたい場所を見つけられます。
              ログインすると、あなたも旅の記録を保存できます。
            </p>

            {!isLoggedIn && (
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                >
                  <Camera className="h-4 w-4" />
                  無料で旅の記録をはじめる
                </Link>
                <Link
                  href="/visits"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8] bg-white px-6 py-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
                >
                  スタンプ帳を見る
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Loading State */}
        {loading && (
          <div className="mt-6 flex items-center justify-center py-12">
            <div className="text-center">
              <div className="font-bold text-[#7B63A8]">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {/* Photo Gallery */}
        {!loading && (
          <>
            <section className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-extrabold">
                  <TrendingUp className="h-5 w-5 text-[#7B63A8]" />
                  最新の投稿
                </h2>
                {totalPosts && (
                  <p className="text-sm font-bold text-[#6B6B6B]">{totalPosts}枚以上の写真</p>
                )}
              </div>

              {visibleFeed.length === 0 ? (
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
                  <p className="text-sm font-bold text-[#6B6B6B]">まだ投稿がありません</p>
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

                        {currentPage === 1 && index < 3 && (
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

            {/* Pagination */}
            {showPagination && (
              <div className="mt-7 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-3 shadow-sm">
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

            {/* Login CTA - shown after scrolling through some photos */}
            {!isLoggedIn && visibleFeed.length > 0 && (
              <section className="mt-8 rounded-[8px] border border-[#FFB347]/30 bg-gradient-to-br from-[#FFF8EB] to-[#FFEDD5] px-6 py-8 text-center shadow-sm">
                <Sparkles className="mx-auto mb-3 h-10 w-10 text-[#7B63A8]" />
                <h3 className="text-xl font-extrabold">この旅を自分のスタンプ帳に保存しませんか？</h3>
                <p className="mt-2 text-sm font-medium text-[#6B6B6B]">
                  ログインすると、訪問済みや行きたい場所を記録できます。
                  全国制覇率や都道府県別の進捗も見られます。
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                  >
                    <Camera className="h-4 w-4" />
                    無料で新規登録
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8] bg-white px-6 py-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
                  >
                    ログイン
                  </Link>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
