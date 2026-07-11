'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Lock,
  MapPin,
  MessageCircle,
  Sparkles,
  Stamp,
  TrendingUp,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PCShell from '@/components/PCShell';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type FeedVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title' | 'pokemons'> | null;
  shot_at: string;
  created_at: string;
  shot_location?: string | null;
  photos: Array<{
    id: string;
    thumbnail_url?: string;
  }>;
  likes_count: number;
  comments_count: number;
  manhole_comments_count?: number;
  display_name?: string | null;
  public_user_id?: string | null;
};

export default function PopularPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [totalManholes, setTotalManholes] = useState<number | null>(null);
  const [manholesWithPhotos, setManholesWithPhotos] = useState<number | null>(null);
  const [rareManholes, setRareManholes] = useState<Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title'>[]>([]);
  const [rareLoading, setRareLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const feedPerPage = 24;
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = '全国のポケふた写真館 - ポケふた訪問記録';

    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
        setSessionChecked(true);
        trackView('/popular', '全国のポケふた写真館', 'popular', loggedIn);
      } catch (error) {
        console.error('Session check error:', error);
        setIsLoggedIn(false);
        setSessionChecked(true);
        trackView('/popular', '全国のポケふた写真館', 'popular', false);
      }
    })();

    loadSiteStats();
    loadRareManholes();
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
      setTotalManholes(typeof data.manholes === 'number' ? data.manholes : null);
      setManholesWithPhotos(typeof data.manholes_with_photos === 'number' ? data.manholes_with_photos : null);
    } catch {
      // ignore
    }
  };

  const loadRareManholes = async () => {
    try {
      const response = await fetch('/api/manholes?no_photos=true&limit=12');
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.manholes)) {
        setRareManholes(data.manholes);
      }
    } catch {
      // ignore
    } finally {
      setRareLoading(false);
    }
  };

  const sortedFeed = [...feed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const totalFeedCount = totalPosts && totalPosts > 0 ? totalPosts : null;
  const totalPages = totalFeedCount ? Math.max(1, Math.ceil(totalFeedCount / feedPerPage)) : null;
  const canGoNext = totalPages ? currentPage < totalPages : feed.length === feedPerPage;
  const showPagination = totalPages ? totalPages > 1 : currentPage > 1 || feed.length === feedPerPage;

  const unmetPhotoCount =
    manholesWithPhotos != null && totalManholes != null
      ? totalManholes - manholesWithPhotos
      : null;

  const pcGuestRail = sessionChecked && !isLoggedIn ? (
    <div className="overflow-hidden rounded-[14px] border border-[#efd9a3] bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#fdeae2] to-[#fdf1e6] px-4 py-3">
        <TrendingUp className="h-4 w-4 text-[#B5483C]" />
        <span className="font-bold text-sm text-[#7d4536]">写真ゼロを埋めよう</span>
        <span className="ml-auto">
          <span className="font-mono text-lg font-bold text-[#B5483C]">{unmetPhotoCount ?? '–'}</span>
          <span className="text-xs text-[#6B6B6B]"> 件 募集中</span>
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-[#4A4A4A] leading-relaxed">
          まだ写真の無いポケふたは残り{' '}
          <b className="text-[#B5483C]">{unmetPhotoCount ?? '–'}</b> 件。あなたの1枚目が、この場所の最初の記録になります。
        </p>
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-3 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
        >
          <Camera className="h-4 w-4" />
          無料で旅の記録をはじめる
        </Link>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-[#9B9B9B]">
          <Lock className="h-3 w-3" />
          ログインして写真を投稿できます
        </p>
      </div>
    </div>
  ) : undefined;

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <div className="lg:hidden">
        <Header title="ポケふた写真館" />
      </div>

      <PCShell rail={pcGuestRail} className="pb-32 pt-5 lg:pt-6">
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-6 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-8 sm:py-8">
          <div className="relative max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
              <Sparkles className="h-3.5 w-3.5" />
              ポケふた写真館
            </div>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-normal sm:text-5xl">
              全国のポケふたを写真で埋めよう
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed sm:text-lg">
              {totalPosts != null && totalPosts > 0 ? (
                <>
                  いま <b>{totalPosts}</b> 枚の写真が集まっています。
                  {unmetPhotoCount != null && unmetPhotoCount > 0 && (
                    <>写真がまだ無いポケふたは残り <b className="text-[#B5483C]">{unmetPhotoCount}</b> 件。</>
                  )}
                </>
              ) : (
                <>全国のポケふたを旅して写真を記録しよう。まだ写真がない場所がたくさんあります。</>
              )}
            </p>

            {!isLoggedIn && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
                >
                  <Camera className="h-4 w-4" />
                  無料で旅の記録をはじめる
                </Link>
                <Link
                  href="/visits"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white/80 px-4 py-2.5 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-white"
                >
                  <Stamp className="h-4 w-4" />
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

        {/* 写真がまだないポケふた */}
        {!rareLoading && rareManholes.length > 0 && (
          <section className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <Stamp className="h-5 w-5 text-[#7B63A8]" />
                写真がまだないポケふた
              </h2>
              <span className="text-sm font-bold text-[#B5483C]">募集中</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {rareManholes.map((manhole) => {
                const label = manhole.building
                  ? [manhole.municipality, manhole.building].filter(Boolean).join('・')
                  : [manhole.prefecture, manhole.municipality].filter(Boolean).join(' ') || manhole.title || 'ポケふた';
                return (
                  <Link
                    key={manhole.id}
                    href={isLoggedIn ? `/upload?manhole_id=${manhole.id}` : '/login'}
                    className="flex items-center gap-2 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-3 py-2.5 text-sm font-bold text-[#4A4A4A] shadow-sm transition hover:border-[#7B63A8]/40 hover:bg-white"
                  >
                    <Camera className="h-4 w-4 shrink-0 text-[#7B63A8]" />
                    <span className="line-clamp-2 text-xs leading-snug">{label}</span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-3 text-center text-xs font-medium text-[#6B6B6B]">
              {isLoggedIn ? '写真を投稿して図鑑を埋めよう' : 'ログインして写真を投稿できます'}
            </p>
          </section>
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

              {sortedFeed.length === 0 ? (
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
                  <p className="text-sm font-bold text-[#6B6B6B]">まだ投稿がありません</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
                  {sortedFeed.map((visit, index) => {
                    const photo = visit.photos?.[0];
                    const locationLabel = visit.manhole?.building
                      ? [visit.manhole.municipality, visit.manhole.building].filter(Boolean).join('・')
                      : [visit.manhole?.prefecture, visit.manhole?.municipality].filter(Boolean).join(' ') || visit.shot_location || '';
                    const manholeId = visit.manhole?.id ?? visit.manhole_id;
                    const canNavigate = Boolean(manholeId);
                    const to = canNavigate ? `/manhole/${manholeId}` : '';
                    const commentCount = visit.manhole_comments_count ?? visit.comments_count;

                    const commonAriaLabel = `${locationLabel}、撮影 ${formatDateJa(visit.shot_at)}、コメント ${commentCount}`;
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
                          {visit.display_name && (
                            visit.public_user_id ? (
                              <span
                                role="link"
                                tabIndex={0}
                                className="mt-0.5 inline-block cursor-pointer text-xs font-medium underline decoration-white/60 underline-offset-2 opacity-80 hover:opacity-100"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/users/${encodeURIComponent(visit.public_user_id!)}/visits`);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    router.push(`/users/${encodeURIComponent(visit.public_user_id!)}/visits`);
                                  }
                                }}
                              >
                                {visit.display_name}
                              </span>
                            ) : (
                              <div className="mt-0.5 text-xs font-medium opacity-80">{visit.display_name}</div>
                            )
                          )}
                          <div className="mt-3 flex items-center gap-4 text-sm font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle className="h-4 w-4" />
                              {commentCount}
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
            {!isLoggedIn && sortedFeed.length > 0 && (
              <section className="mt-8 rounded-[8px] border border-[#FFB347]/30 bg-gradient-to-br from-[#FFF8EB] to-[#FFEDD5] px-6 py-8 text-center shadow-sm">
                <Sparkles className="mx-auto mb-3 h-10 w-10 text-[#7B63A8]" />
                <h3 className="text-xl font-extrabold">この旅を自分のスタンプ帳に保存しませんか？</h3>
                <p className="mt-2 text-sm font-medium text-[#6B6B6B]">
                  ログインすると、旅の続きとして訪問済みや行きたい場所を記録できます。
                  全国制覇率や都道府県別の進捗も見られます。
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                  >
                    <Camera className="h-4 w-4" />
                    無料で新規登録
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8] bg-white px-6 py-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
                  >
                    旅の続きへ
                  </Link>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      </PCShell>

      <BottomNav />
    </div>
  );
}
