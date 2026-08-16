'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  UserRound,
  Image as ImageIcon,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import PCShell from '@/components/PCShell';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa, formatDateJaJst } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { SITE_NAME } from '@/lib/constants';
import { DESIGN_MANHOLE_SUBMISSION_SUSPENDED } from '@/lib/design-manhole-submission-status';

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
};

/**
 * 「新着投稿」バッジの対象。
 *
 * 投稿日ではなく撮影日で判定する。写真は旅から帰ってからまとめて上げられるので、
 * 投稿日で見ると中央値29日・平均177日前に撮られたものが「新着」を名乗ってしまう。
 * バッジが付くのはグリッド内の該当分だけで、フィードの並びと件数には影響しない。
 */
const FRESHLY_SHOT_DAYS = 3;

function isFreshlyShot(shotAt: string | null | undefined): boolean {
  if (!shotAt) return false;
  const shot = new Date(shotAt).getTime();
  if (Number.isNaN(shot)) return false;
  // 端末時計のズレで直前の撮影が弾かれないよう未来側も見るが、同じ幅で打ち切る。
  // 片側を開けたままにすると、カメラの日付設定を誤った1枚に「新着投稿」が
  // 未来永劫つき続ける。
  const distance = Math.abs(Date.now() - shot);
  return distance < FRESHLY_SHOT_DAYS * 24 * 60 * 60 * 1000;
}

export default function HomePage() {
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
  const { trackView, trackSubmissionEntry } = useAnalytics();

  useEffect(() => {
    document.title = SITE_NAME;

    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
        setSessionChecked(true);
        trackView('/', 'ポケふた写真館', 'gallery_index', loggedIn);
      } catch (error) {
        console.error('Session check error:', error);
        setIsLoggedIn(false);
        setSessionChecked(true);
        trackView('/', 'ポケふた写真館', 'gallery_index', false);
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

  // 右レールは未ログイン時の募集カードだけ。ログイン中は rail を渡さないので
  // PCShell は1カラムのままになり、本文幅が狭まらない。
  const pcGuestRail = sessionChecked && !isLoggedIn ? (
    <div className="overflow-hidden rounded-[14px] border border-[#efd9a3] bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#fdeae2] to-[#fdf1e6] px-4 py-3">
        <TrendingUp className="h-4 w-4 text-[#B5483C]" />
        <span className="font-bold text-sm text-[#7d4536]">写真ゼロを埋めよう</span>
        <span className="ml-auto">
          <span className="font-mono text-lg font-bold text-[#B5483C]">{unmetPhotoCount ?? '–'}</span>
          <span className="text-xs text-[#6B6B6B]"> 枚 募集中</span>
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-[#4A4A4A] leading-relaxed">
          まだ写真の無いポケふたは残り{' '}
          <b className="text-[#B5483C]">{unmetPhotoCount ?? '–'}</b> 枚。あなたの1枚目が、この場所の最初の記録になります。
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
    // pb-nav-safe はここには要らない。固定下タブを避ける責任は、この後ろに描かれる
    // SpUtilityFooter 自身が持っている（SiteChrome のコメント参照）。ページ側に付けると
    // フッターより手前なので下タブは避けられず、本文とフッターの間の空白になるだけ。
    <div className="min-h-content safe-area-body bg-[#F6EEDC] text-[#2A2A2A]">

      {/*
        pb-32(112px) は下タブと投稿FABを避けるための余白だったが、下タブ回避は
        フッターが担っているので本文には要らない。ここはフッターとの間隔として
        必要な分だけ残す。
      */}
      <PCShell rail={pcGuestRail} className="pb-10 pt-5 lg:pb-12 lg:pt-6">
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-6 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-8 sm:py-8">
          <div className="relative max-w-3xl">
            {/*
              日本語は単語区切りが無いので、放っておくと文字単位で折り返して
              「う」だけが次行に落ちる。意味のまとまりを inline-block にして、
              改行しうる箇所をこの2つの境目だけに限定する。
              text-wrap 系のプロパティと違い、対応ブラウザを問わず効く。
            */}
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-normal sm:text-5xl">
              <span className="inline-block">全国のポケふたを</span>
              <span className="inline-block">写真で埋めよう</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed sm:text-lg">
              {/*
                蓋を数える単位は「枚」で揃える（CLAUDE.md の用語規約。以前ここだけ
                「件」になっていた）。本文なので概念名の「デザインマンホール」を使い、
                ナビ用ラベルの「デザインふた」は使わない。
              */}
              {totalPosts != null && totalPosts > 0 ? (
                <>
                  ポケふたの写真が <b>{totalPosts}</b> 枚集まっています。
                  {unmetPhotoCount != null && unmetPhotoCount > 0 && (
                    <>写真がまだ無いポケふたは残り <b className="text-[#B5483C]">{unmetPhotoCount}</b> 枚。</>
                  )}
                </>
              ) : (
                <>全国のポケふたを旅して写真を記録しよう。まだ写真がない場所がたくさんあります。</>
              )}
            </p>

            {/*
              新規登録を主役にする。以前は2つのボタンが同じ大きさ・同じ重みで
              並んでいて、どちらが主かが読めなかった。登録側だけを一段大きくし、
              スタンプ帳は枠線を外して副次的な見た目に落とす。
            */}
            {!isLoggedIn && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#7B63A8] px-6 py-3.5 text-base font-extrabold text-white shadow-[0_4px_0_#5f55b8] transition hover:bg-[#6A5299] active:translate-y-0.5 active:shadow-[0_2px_0_#5f55b8]"
                >
                  <Camera className="h-5 w-5" />
                  無料で旅の記録をはじめる
                </Link>
                <Link
                  href="/visits"
                  className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-bold text-[#7B63A8] underline-offset-4 transition hover:underline"
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

        <section className="mt-6 overflow-hidden rounded-[8px] border border-[#7B63A8]/25 bg-gradient-to-br from-[#F4F0FA] to-[#FFF8EB] p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-[#7B63A8] text-white shadow-sm">
              <ImageIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-extrabold text-[#7B63A8]">ポケふただけじゃない</p>
              <h2 className="mt-0.5 text-lg font-extrabold">デザインふたも集まっています</h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#5F574F]">
                キャラクター・ご当地デザインなど、みんなが見つけた全国のマンホールを楽しめます。
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/design-manholes"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#7B63A8] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
            >
              みんなの投稿を見る
            </Link>
            {DESIGN_MANHOLE_SUBMISSION_SUSPENDED ? (
              <span
                aria-disabled="true"
                className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg border border-[#7B63A8]/20 bg-white/50 px-4 text-sm font-bold text-[#5E4788]/55"
              >
                投稿は一時停止中
              </span>
            ) : (
              <Link
                href="/design-manholes/new"
                onClick={() => trackSubmissionEntry({ submission_kind: 'design', surface: 'home_design_manhole_card' })}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#7B63A8]/35 bg-white/80 px-4 text-sm font-bold text-[#5E4788] transition hover:bg-white"
              >
                見つけたマンホールを投稿
              </Link>
            )}
          </div>
        </section>

        {/* Photo Gallery */}
        {!loading && (
          <>
            <section className="mt-6">
              {/* 総枚数はヒーローに出しているので、ここでは繰り返さない */}
              <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
                <TrendingUp className="h-5 w-5 text-[#7B63A8]" />
                最新の投稿
              </h2>

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

                    const posterLabel = visit.display_name ? `投稿者 ${visit.display_name}` : null;
                    const isFresh = isFreshlyShot(visit.shot_at);
                    // カード全体に aria-label を張っているので、中の要素の文言は読み上げられない。
                    // バッジを足したら、ここにも同じことを書かないと目で見える情報と食い違う。
                    const commonAriaLabel = [
                      isFresh ? '新着投稿' : null,
                      locationLabel,
                      `撮影 ${formatDateJa(visit.shot_at)}`,
                      posterLabel,
                      commentCount > 0 ? `口コミ ${commentCount}件` : null,
                    ].filter(Boolean).join('、');
                    const cardContent = (
                      <>
                        {photo?.thumbnail_url ? (
                          <img
                            src={photo.thumbnail_url}
                            alt=""
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading={currentPage === 1 && index < 4 ? 'eager' : 'lazy'}
                            fetchPriority={currentPage === 1 && index < 4 ? 'high' : undefined}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#FFF8EB] text-[#7B63A8]">
                            <MapPin className="h-8 w-8 opacity-80" />
                          </div>
                        )}

                        {isFresh && (
                          <span className="absolute left-2 top-2 rounded-[6px] bg-[#7B63A8] px-2 py-1 text-xs font-extrabold text-white shadow-sm">
                            新着投稿
                          </span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-14 text-white sm:p-4 sm:pt-20">
                          <div className="line-clamp-1 text-sm font-extrabold sm:text-base">
                            {locationLabel || 'ポケふた'}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white/90">
                            {formatDateJaJst(visit.shot_at)}撮影
                          </div>
                          {posterLabel && (
                            <div className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold text-white/85">
                              <UserRound className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{posterLabel}</span>
                            </div>
                          )}
                          {commentCount > 0 && (
                            <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-white/85">
                              <span className="inline-flex items-center gap-1">
                                <MessageCircle className="h-4 w-4" />
                                口コミ {commentCount}件
                              </span>
                            </div>
                          )}
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

        {/* 写真がまだないポケふた（募集枠なので、最新の投稿を見終わった一番下に置く） */}
        {!rareLoading && rareManholes.length > 0 && (
          <section className="mt-8">
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
            {/*
              「募集中」だけだと、このタイルを押すと何が起きるかが書かれていない。
              押した先は投稿画面（未ログインならログイン）なので、そこを説明する。
              以前の「写真を投稿して図鑑を埋めよう」は掛け声で、操作の説明になっていなかった。
            */}
            <p className="mt-3 text-center text-xs font-medium text-[#6B6B6B]">
              {isLoggedIn
                ? 'タップすると、その場所の投稿画面へ進みます'
                : 'ログインすると、ここから写真を投稿できます'}
            </p>
          </section>
        )}
      </main>
      </PCShell>

    </div>
  );
}
