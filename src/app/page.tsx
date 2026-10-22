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
  Stamp,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import PCShell from '@/components/PCShell';
import LandscapePhotoBadge from '@/components/LandscapePhotoBadge';
import RegularBadge from '@/components/RegularBadge';
import AiPhotoTags from '@/components/AiPhotoTags';
import AiTagNote from '@/components/AiTagNote';
import { photoAiBoxes, photoAiTags, photoBoxZoom, photoObjectPosition } from '@/lib/photo-ai-tags';
import RecentComments from '@/components/comments/RecentComments';
import { fetchAllManholes, pickManholesWithoutPhotos } from '@/lib/manhole-list-client';
import { prefectureDexUrl } from '@/lib/prefectureSlug';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa, formatDateJaJst } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { SITE_NAME } from '@/lib/constants';
import type { CompletionRollup } from '@/lib/prefecture-completion';
import type { LatestManholeComment } from '@/lib/latest-manhole-comment';
import { manholeDisplayName } from '@/lib/manhole-label';
import { collapseByPoster, feedCardTags, sameDayVisitorCounts } from '@/lib/feed-card-tags';
import { FEED_CHIP_CLASS } from '@/lib/feed-chip-class';
import { EMPTY_REGULAR_BADGES, REGULAR_BADGE_LABEL, fetchRegularBadges } from '@/lib/regular-badges';

type FeedVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title' | 'pokemons'> | null;
  shot_at: string;
  created_at: string;
  shot_location?: string | null;
  public_user_id?: string | null;
  photos: Array<{
    id: string;
    thumbnail_url?: string;
    is_landscape?: boolean;
    ai_tags?: unknown;
  }>;
  likes_count: number;
  comments_count: number;
  manhole_comments_count?: number;
  latest_manhole_comment?: LatestManholeComment | null;
  display_name?: string | null;
};

// 写真の上に直接載るので、どの写真の上でも読めるよう明るい不透明の地にする
// タグの色は特集ページと共有する（src/lib/feed-chip-class.ts）
const CHIP_CLASS = FEED_CHIP_CLASS;

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  // 最初の投稿の取得が終わったか。loading はページ送りのたびに true に戻るので、
  // 一覧より下の節を出すかどうかはこちらで決める（ページ送りで節を消さない）
  const [feedSettled, setFeedSettled] = useState(false);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  // 公開中(status='published')のみ。デザインマンホール一覧で見える枚数と一致する
  const [designManholes, setDesignManholes] = useState<number | null>(null);
  const [rareManholes, setRareManholes] = useState<Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title'>[]>([]);
  const [rareLoading, setRareLoading] = useState(true);
  const [completion, setCompletion] = useState<CompletionRollup | null>(null);
  // 取得が終わったか（成否を問わない）。終わるまで残りの文を出さないための旗。
  const [completionLoaded, setCompletionLoaded] = useState(false);
  // 特集（ぬいぐるみと旅するポケふた）の入口に出す写真と枚数。取れなければ特集を出さない
  // undefined は取得中（ヒーローに枠を確保しておく）、null は取れなかった・0枚
  const [plushFeature, setPlushFeature] = useState<{ count: number; photos: Array<{ id: string; ai_tags?: unknown }> } | null | undefined>(undefined);
  // 特集（デザインふた）の入口に出す新着の写真。枚数は designManholes（サイト統計）を使う
  const [designFeature, setDesignFeature] = useState<Array<{ id: string; title: string | null; photo_url: string }> | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [regularBadges, setRegularBadges] = useState(EMPTY_REGULAR_BADGES);
  // スマホ（Tailwind の sm 未満）か。幅が分かるまでは null（口コミの置き場所を決めない）
  const [isSp, setIsSp] = useState<boolean | null>(null);
  const feedPerPage = 24;
  const { trackView } = useAnalytics();

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
        trackView('/', 'ポケふた写真館', 'gallery_index', loggedIn);
      } catch (error) {
        console.error('Session check error:', error);
        setIsLoggedIn(false);
        trackView('/', 'ポケふた写真館', 'gallery_index', false);
      }
    })();

    loadSiteStats();
    loadRareManholes();
    loadCompletion();
    loadPlushFeature();
    loadDesignFeature();
    fetchRegularBadges().then(setRegularBadges);
  }, []);

  useEffect(() => {
    loadFeed();
  }, [currentPage]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsSp(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * feedPerPage;
      const response = await fetch(
        `/api/visits?with_photos=true&limit=${feedPerPage}&offset=${offset}&order_by=created_at&with_latest_comment=true`,
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
      setFeedSettled(true);
    }
  };

  const loadSiteStats = async () => {
    try {
      const response = await fetch('/api/site-stats');
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.success) return;
      // 写真館で見えるのは公開訪問の写真だけ。全写真数 posts を出すと、
      // 非公開にした写真まで「集まっています」に含まれて表示と食い違う。
      setTotalPosts(typeof data.public_posts === 'number' ? data.public_posts : null);
      setDesignManholes(typeof data.design_manholes === 'number' ? data.design_manholes : null);
    } catch {
      // ignore
    }
  };

  const loadPlushFeature = async () => {
    try {
      const response = await fetch('/api/features/plush');
      if (!response.ok) return setPlushFeature(null);
      const data = await response.json();
      if (!data?.success || typeof data.count !== 'number' || !Array.isArray(data.photos)) return setPlushFeature(null);
      setPlushFeature({ count: data.count, photos: data.photos });
    } catch {
      setPlushFeature(null);
    }
  };

  const loadDesignFeature = async () => {
    try {
      const response = await fetch('/api/design-manholes?limit=3');
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.success || !Array.isArray(data.design_manholes)) return;
      setDesignFeature(data.design_manholes);
    } catch {
      // ignore
    }
  };

  const loadCompletion = async () => {
    try {
      const response = await fetch('/api/prefecture-completion');
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.success) return;
      setCompletion(data as CompletionRollup);
    } catch {
      // ignore
    } finally {
      setCompletionLoaded(true);
    }
  };

  const loadRareManholes = async () => {
    try {
      const data = await fetchAllManholes();
      if (data) {
        setRareManholes(pickManholesWithoutPhotos(data.manholes, 12));
      }
    } catch {
      // ignore
    } finally {
      setRareLoading(false);
    }
  };

  // ヒーローにぬいぐるみの枠（取得中を含む）があるか。無いときはスマホの「募集中」を2行目でなく「近くを探す」の右に入れる
  const plushInHero = plushFeature === undefined || (plushFeature != null && plushFeature.count > 0);
  // 募集カードは、写真の無い蓋が一番多い県を1つ（incomplete は残りの少ない順なので末尾）。枚数は公開写真で数えた completion
  const wantedPrefecture = completion?.incomplete.length ? completion.incomplete[completion.incomplete.length - 1] : null;
  const wantedHref = wantedPrefecture ? prefectureDexUrl(wantedPrefecture.prefecture) : null;
  // 全部の蓋に写真が届いたら、ページ下（写真がまだないポケふたの場所）にお礼を出す。新しい蓋が設置されれば incomplete に戻り、ヒーローに募集カードが出る
  const allCollected = completion != null && completion.completeCount > 0 && completion.incompleteCount === 0;

  const sortedFeed = [...feed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const sameDayCounts = sameDayVisitorCounts(sortedFeed);
  const feedById = new Map(sortedFeed.map((visit) => [visit.id, visit]));
  const totalFeedCount = totalPosts && totalPosts > 0 ? totalPosts : null;
  const totalPages = totalFeedCount ? Math.max(1, Math.ceil(totalFeedCount / feedPerPage)) : null;
  const canGoNext = totalPages ? currentPage < totalPages : feed.length === feedPerPage;
  const showPagination = totalPages ? totalPages > 1 : currentPage > 1 || feed.length === feedPerPage;

  // PC の右レール（未ログイン向けの「写真ゼロを埋めよう」募集カード）は外した。
  // 登録導線はヒーロー内のボタンが担っており重複していた上に、レールが出ると
  // 本文カラムが 1064px → 618px まで縮み、見出しが折り返す原因になっていた。
  // rail を渡さなければ PCShell は1カラムのままになる。

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
      <PCShell className="pb-10 pt-2 sm:pt-5 lg:pb-12 lg:pt-6">
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-4 py-4 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-8 sm:py-8">
          <div className="relative max-w-3xl">
            {/*
              日本語は単語区切りが無いので、放っておくと文字単位で折り返して
              「う」だけが次行に落ちる。意味のまとまりを inline-block にして、
              改行しうる箇所をこの2つの境目だけに限定する。
              text-wrap 系のプロパティと違い、対応ブラウザを問わず効く。

              max-w-2xl を付けてはいけない。ルートの font-size が 14px なので
              2xl は 588px にしかならず、見出しも下の本文（590px）も、
              親の max-w-3xl（672px）には収まるのに自分の上限だけで折り返っていた。
              行長は親の max-w-3xl で決める。
            */}
            <h1 className="whitespace-nowrap text-[clamp(0.95rem,5.15vw,1.875rem)] font-extrabold leading-tight tracking-[-0.03em] md:text-5xl md:tracking-normal">
              全国のポケふたを写真で埋めよう
            </h1>
            <p className="mt-2 text-sm font-medium leading-relaxed sm:mt-4 sm:text-lg">
              {/*
                蓋を数える単位は「枚」で揃える（CLAUDE.md の用語規約。以前ここだけ
                「件」になっていた）。本文なので概念名の「デザインマンホール」を使い、
                ナビ用ラベルの「デザインふた」は使わない。

                数字と単位は whitespace-nowrap で括る。半角数字の前後の空白が
                折り返し候補になるため、幅次第で「枚。」だけが次行に落ちる。
                枚数は日々増えて桁も変わるので、幅で回避せず構造で止める。
              */}
              {totalPosts != null && totalPosts > 0 ? (
                <>
                  ポケふたの写真が <span className="whitespace-nowrap"><b>{totalPosts}</b> 枚</span>集まっています。
                  {/*
                    残り枚数だけを出していたときは、全国の残りが十数枚しかなく
                    埋まるのも遅いので、数字が何週間も動かなかった。動かない数字は
                    進捗として読めない。残っている蓋は少数の都道府県に固まって
                    いるので、都道府県を単位にして「残りN都道府県」を主役にし、
                    枚数はその内訳として添える。
                  */}
                  {/*
                    取得が終わるまでは残りの文を出さない。先に枚数版を出して
                    から県版へ差し替えると、長さの違う文がヒーローの中で
                    書き換わって行が送られる。
                  */}
                  {completionLoaded && completion && completion.incompleteCount > 0 && (
                    <>写真がまだ無いのは <span className="whitespace-nowrap"><b className="text-[#B5483C]">{completion.incompleteCount}</b> 都道府県</span>の <span className="whitespace-nowrap"><b className="text-[#B5483C]">{completion.missingTotal}</b> 枚だけ。</span></>
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
              <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#7B63A8] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_#5f55b8] transition hover:bg-[#6A5299] active:translate-y-0.5 active:shadow-[0_2px_0_#5f55b8] sm:px-6 sm:py-3.5 sm:text-base"
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

          {/*
            行動のカード（＋ぬいぐるみの特集）。「近くを探す」は常連が一番使う機能（/nearby）で、待たずに出せるので左に置く。
            「◯◯で募集中」は見出しの「写真で埋めよう」の残りを、写真の無い蓋が一番多い県で具体的に見せる。
            completion の応答を待って PC は右、スマホは次の行に横いっぱいで現れるので、左のカードは動かない。県の地図と一覧は図鑑の県ページが持っている
          */}
          <div className="relative mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
            <Link
              href="/nearby"
              className="group flex min-w-0 items-center gap-2 rounded-[8px] border border-[#7B63A8]/20 bg-white p-2.5 shadow-sm transition hover:shadow sm:gap-3 sm:p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7B63A8] text-white sm:h-12 sm:w-12">
                <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <span className="min-w-0">
                {/* スマホは幅が半分なので短くする（「探す」が次の行に落ちないように） */}
                <span className="block text-xs font-extrabold text-[#4A4A4A] sm:text-base">近くのポケふた<span className="max-sm:hidden">を探す</span></span>
                <span className="block whitespace-nowrap text-[11px] text-[#6A4D36] sm:text-xs">
                  現在地から<span className="max-sm:hidden">近い順</span><span className="sm:hidden">探す</span><span className="ml-1 font-bold text-[#7B63A8] group-hover:underline">›</span>
                </span>
              </span>
            </Link>
            {/*
              ぬいぐるみの特集。最新の投稿の下へ一度下げた（2026-10-18）が、ヒーローに戻した（2026-10-22）。
              スマホは「近くを探す」の右に半分の幅で並べ、PC は2枚の下に横いっぱいで置く（sm:order-last）。
              DOM の順はスマホの見た目に合わせてあり、PC だけ読み上げ・Tab の順が見た目と食い違う。
              取得を待って後から差し込むとヒーローより下がまとめて押し下げられる（CLS、#338）ので、
              取得中は同じ場所に枠を置いておく（スマホは行の高さに伸びる）。取れなかったときだけ枠ごと消す
            */}
            {plushFeature === undefined && (
              <div className="rounded-[8px] border border-[#7B63A8]/10 bg-white/60 sm:order-last sm:col-span-2 sm:h-[76px]" aria-hidden="true" />
            )}
            {plushFeature && plushFeature.count > 0 && (
              <Link
                href="/photos/plush"
                className="group flex min-w-0 items-center gap-2 rounded-[8px] border border-[#7B63A8]/20 bg-white p-2.5 shadow-sm transition hover:shadow sm:order-last sm:col-span-2 sm:h-[76px] sm:gap-3 sm:px-4 sm:py-0"
              >
                {/* 特集ページと同じく、蓋（丸）とぬいぐるみ（右下のステッカー）をそれぞれ切り抜いて小さく並べる。スマホは半分の幅なので1枚だけ、他のカードの丸と同じ 40px に縮める */}
                <div className="flex shrink-0 gap-1 max-sm:[zoom:0.72]">
                  {plushFeature.photos.map((photo, index) => {
                    const { lid, plush } = photoAiBoxes(photo.ai_tags);
                    const lidClip = lid ? photoBoxZoom(photo.ai_tags, lid, 1.04) : undefined;
                    const plushClip = plush ? photoBoxZoom(photo.ai_tags, plush, 1.12) : undefined;
                    const src = `/api/photo/${photo.id}?size=small`;
                    return (
                      <div key={photo.id} className={`relative h-14 w-14 ${index > 0 ? 'max-sm:hidden' : ''}`}>
                        <div className="absolute left-0 top-0 h-[46px] w-[46px] overflow-hidden rounded-full border-2 border-white bg-[#EFE4CC] shadow-sm">
                          <img src={src} alt="" width={56} height={56} loading="lazy"
                            className={lidClip ? undefined : 'h-full w-full object-cover'}
                            style={lidClip ?? { objectPosition: photoObjectPosition(photo.ai_tags) }} />
                        </div>
                        {plushClip && (
                          <div className="absolute bottom-0 right-0 h-[26px] w-[26px] rotate-[4deg] overflow-hidden rounded-[7px] border-2 border-white bg-[#EFE4CC] shadow">
                            <img src={src} alt="" width={26} height={26} loading="lazy" style={plushClip} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-[#4A4A4A] sm:text-base">
                    <span className="truncate">ぬいぐるみ<span className="max-sm:hidden">と旅するポケふた</span><span className="sm:hidden">特集</span></span>
                    <span className="hidden shrink-0 rounded-full bg-[#7B63A8] px-1.5 py-0.5 text-[10px] font-extrabold text-white sm:inline">ベータ</span>
                  </p>
                  <p className="whitespace-nowrap text-[11px] text-[#6A4D36] sm:text-xs">
                    <span className="hidden sm:inline">ぬいぐるみと一緒に撮られた</span>写真 {plushFeature.count}枚
                    <span className="ml-1 font-bold text-[#7B63A8] group-hover:underline"><span className="max-sm:hidden">見る </span>›</span>
                  </p>
                </div>
              </Link>
            )}
            {/*
              スマホでは「募集中」が2行目に1枚で現れ、行ごと増える。取得中は同じ高さ（丸の分）の枠で行を取っておく。
              PC は「近くを探す」の右に入るだけで行は増えないので枠は要らない。
              ぬいぐるみが取れなかったときは右半分が空くので、そこへ入れる（横いっぱいにしない）
            */}
            {!completionLoaded && (
              <div className={`rounded-[8px] border border-transparent p-2.5 sm:hidden ${plushInHero ? 'max-sm:col-span-2' : ''}`} aria-hidden="true">
                <span className="block h-10 w-10" />
              </div>
            )}
            {wantedPrefecture && wantedHref && (
              <a
                href={wantedHref}
                className={`group flex min-w-0 items-center gap-2 rounded-[8px] border border-[#B5483C]/25 bg-white p-2.5 shadow-sm transition hover:shadow sm:gap-3 sm:p-4 ${plushInHero ? 'max-sm:col-span-2' : ''}`}
              >
                {/* 写真の無い蓋は図鑑にも蓋の画像が無い（切り抜きは投稿写真から作る）ので、「？」の丸で見せる */}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#B5483C]/50 bg-[#FFF3EF] text-lg font-extrabold text-[#B5483C] sm:h-12 sm:w-12 sm:text-xl">
                  ？
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold text-[#4A4A4A] sm:text-base">
                    {wantedPrefecture.prefecture.replace(/[県府都]$/, '')}で<span className="text-[#B5483C]">募集中</span>
                  </span>
                  <span className="block whitespace-nowrap text-[11px] text-[#6A4D36] sm:text-xs">
                    <span className="max-sm:hidden">写真が無いポケふた </span>あと<b className="text-[#B5483C]">{wantedPrefecture.missing}</b>枚
                  </span>
                </span>
              </a>
            )}
          </div>

        </section>

        {/* Loading State */}
        {loading && (
          <div className="mt-4 flex items-center justify-center py-8 sm:mt-6 sm:py-12">
            <div className="text-center">
              <div className="font-bold text-[#7B63A8]">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {/* 口コミが少ないうちは最新の投稿に口コミ付きの蓋が来ないので、別枠で拾う */}
        {/*
          口コミの位置は画面幅で変える。PC はここ（最新の投稿の上）、スマホは最新の投稿の後ろ
          （ファーストビューを投稿の写真に使う）。CSS の order だと読み上げ・Tab の順が見た目と
          食い違うので、置く場所そのものを変える。幅が分かるまでは出さない（RecentComments は
          データが来るまで何も描かないので、出すのが少し遅れてもずれない）。一度だけ描くので取得も1回
        */}
        {currentPage === 1 && isSp === false && <RecentComments />}

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
                  {collapseByPoster(sortedFeed).map((item, index) => {
                    if (item.kind === 'collapsed') {
                      const hiddenPhotos = item.hidden
                        .map((id) => feedById.get(id)?.photos?.[0]?.thumbnail_url)
                        .filter((url): url is string => Boolean(url))
                        .slice(0, 4);
                      const who = item.display_name ? `${item.display_name}さん` : 'この人';
                      const summary = `${who}の投稿 ほか${item.hidden.length}枚`;
                      // 投稿が多い人ほどここに畳まれるので、個別カードと同じバッジを出す
                      const collapsedTier = regularBadges.get(item.public_user_id);
                      return (
                        <Link
                          key={`collapsed-${item.public_user_id}`}
                          href={`/users/${encodeURIComponent(item.public_user_id)}/visits`}
                          className="group relative aspect-square overflow-hidden rounded-[8px] bg-[#2E2346] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
                          aria-label={[summary, collapsedTier ? REGULAR_BADGE_LABEL[collapsedTier] : null, item.busiestDay >= 3 ? `1日で${item.busiestDay}枚ハシゴ` : null, '投稿をすべて見る'].filter(Boolean).join('、')}
                        >
                          {/* 畳んだ写真を2x2で敷き、暗く落として文字を載せる */}
                          <div className="grid h-full w-full grid-cols-2 grid-rows-2 opacity-45">
                            {hiddenPhotos.map((url) => (
                              <img key={url} src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ))}
                          </div>
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
                            {item.busiestDay >= 3 && (
                              <span className="rounded-full bg-[#FFB347] px-2.5 py-1 text-xs font-extrabold leading-none text-[#2E2346] shadow-sm">
                                1日で{item.busiestDay}枚ハシゴ
                              </span>
                            )}
                            <div className="text-base font-extrabold sm:text-lg">
                              ほか{item.hidden.length}枚
                            </div>
                            <div className="flex min-w-0 max-w-full items-center justify-center gap-1 text-xs font-semibold text-white/85 sm:text-sm">
                              <span className="truncate">{who}の投稿</span>
                              {collapsedTier && <RegularBadge tier={collapsedTier} />}
                            </div>
                            <div className="mt-1 inline-flex items-center gap-0.5 text-xs font-extrabold text-[#FFB347]">
                              すべて見る
                              <ChevronRight className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        </Link>
                      );
                    }
                    const visit = item.visit;
                    const chips = feedCardTags(visit, sameDayCounts.get(visit.id));
                    const photo = visit.photos?.[0];
                    const locationLabel = visit.manhole ? manholeDisplayName(visit.manhole) : visit.shot_location || '';
                    const manholeId = visit.manhole?.id ?? visit.manhole_id;
                    const canNavigate = Boolean(manholeId);
                    const to = canNavigate ? `/manhole/${manholeId}` : '';
                    const commentCount = visit.manhole_comments_count ?? visit.comments_count;
                    const latestComment = commentCount > 0 ? visit.latest_manhole_comment ?? null : null;

                    const posterLabel = visit.display_name ? `投稿者 ${visit.display_name}` : null;
                    const regularTier = posterLabel && visit.public_user_id
                      ? regularBadges.get(visit.public_user_id)
                      : undefined;
                    const regularLabel = regularTier ? REGULAR_BADGE_LABEL[regularTier] : null;
                    // カード全体に aria-label を張っているので、中の要素の文言は読み上げられない。
                    // バッジを足したら、ここにも同じことを書かないと目で見える情報と食い違う。
                    const commonAriaLabel = [
                      photo?.is_landscape ? '周辺の風景' : null,
                      ...chips.map((chip) => chip.label),
                      locationLabel,
                      `撮影 ${formatDateJa(visit.shot_at)}`,
                      posterLabel,
                      regularLabel,
                      commentCount > 0 ? `口コミ ${commentCount}件` : null,
                      latestComment ? `最新の口コミ「${latestComment.content}」` : null,
                    ].filter(Boolean).join('、');
                    const cardContent = (
                      <>
                        {photo?.thumbnail_url ? (
                          <img
                            src={photo.thumbnail_url}
                            alt=""
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            style={{ objectPosition: photoObjectPosition(photo.ai_tags) }}
                            loading={currentPage === 1 && index < 4 ? 'eager' : 'lazy'}
                            fetchPriority={currentPage === 1 && index < 4 ? 'high' : undefined}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#FFF8EB] text-[#7B63A8]">
                            <MapPin className="h-8 w-8 opacity-80" />
                          </div>
                        )}

                        {/* タグは口コミ件数と同じく写真の上に置く。右上の口コミバッジと重ならないよう右を空ける */}
                        {(chips.length > 0 || photo?.is_landscape || (photo && photoAiTags(photo).length > 0)) && (
                          <div className="absolute left-2 right-14 top-2 flex flex-wrap gap-1">
                            <LandscapePhotoBadge isLandscape={photo?.is_landscape} />
                            {photo && <AiPhotoTags photo={photo} />}
                            {chips.map((chip) => (
                              <span key={chip.tag} className={`rounded-full px-2 py-1 text-xs font-extrabold leading-none shadow-sm ${CHIP_CLASS[chip.tag]}`}>
                                {chip.label}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* 口コミの有無は写真の上で一目でわかるようにする（下の帯に置くと文字に埋もれる） */}
                        {commentCount > 0 && (
                          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-xs font-extrabold text-[#7B63A8] shadow-sm">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {commentCount}
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
                              {regularTier && <RegularBadge tier={regularTier} />}
                            </div>
                          )}
                        </div>

                        {/*
                          マウスを乗せると最新の口コミを写真の上に出す。タッチ端末ではタップが
                          そのまま遷移になるので出さない（hover: hover の端末に限る）。
                          読み上げはカードの aria-label に同じ内容を入れてある。
                        */}
                        {latestComment && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 flex flex-col justify-center bg-[#2E2346]/90 p-4 text-white opacity-0 transition-opacity duration-200 [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:opacity-100 sm:p-5"
                          >
                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#FFB347]">
                              <MessageCircle className="h-4 w-4" />
                              最新の口コミ（全{commentCount}件）
                            </div>
                            <p className="mt-2 line-clamp-5 text-sm font-semibold leading-relaxed">
                              「{latestComment.content}」
                            </p>
                            <div className="mt-2 text-xs font-semibold text-white/70">
                              {formatDateJaJst(latestComment.created_at)}
                            </div>
                            {canNavigate && (
                              <div className="mt-3 inline-flex items-center gap-0.5 text-xs font-extrabold text-[#FFB347]">
                                蓋のページで読む
                                <ChevronRight className="h-3.5 w-3.5" />
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );

                    if (!canNavigate) {
                      return (
                        // 素の div の aria-label は読み上げられない（generic 要素は名前を持てない）。
                        // 口コミ件数はバッジの数字だけなので、group にしてラベルを効かせる。
                        <div
                          key={visit.id}
                          role="group"
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
              <AiTagNote
                className="mt-3"
                show={sortedFeed.some((visit) => visit.photos?.[0] && photoAiTags(visit.photos[0]).length > 0)}
              />
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

        {/*
          最新の投稿より下の節（スマホの口コミ・特集・写真がまだないポケふた）は、最初の投稿が出るまで描かない。
          どれも投稿より先にデータが届くことがあり、背の低い「読み込み中」の直下に一度描かれてから、
          投稿の一覧が入った分だけまとめて押し下げられていた。モバイルの CLS が 0.18（Search Console）、
          Lighthouse で 0.57 になっていた原因（2026-10-18）。ページ送りでは消さない（feedSettled）
        */}
        {feedSettled && currentPage === 1 && isSp === true && <RecentComments />}

        {/*
          特集（デザインふた）。ぬいぐるみの特集は一度ここへ下げた（2026-10-18）が、ヒーローに戻した（2026-10-22）。
          PC は写真3枚と説明の横長カード、スマホは写真2枚。取れなければ節ごと出さない
        */}
        {feedSettled && designFeature && designFeature.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
              <Sparkles className="h-5 w-5 text-[#7B63A8]" />
              特集
            </h2>
            <div className="grid grid-cols-2 gap-2">
            {designFeature && designFeature.length > 0 && (
            <Link
              href="/design-manholes"
              className="group flex min-w-0 flex-col gap-1.5 rounded-lg bg-white p-2 shadow-sm transition hover:shadow sm:flex-row sm:items-center sm:gap-3"
            >
              {/* デザインふたは枠の判定が無いので、新着の写真をそのまま角丸の正方形で並べる */}
              <div className="flex shrink-0 gap-1 max-sm:[zoom:0.72]">
                {designFeature.map((d, index) => (
                  <div key={d.id} className={`h-14 w-14 overflow-hidden rounded-lg border-2 border-white bg-[#EFE4CC] shadow-sm ${index === 2 ? 'max-sm:hidden' : ''}`}>
                    <img src={d.photo_url} alt={d.title ?? ''} width={56} height={56} loading="lazy" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-[#4A4A4A] sm:text-sm">みんなのデザインふた</p>
                <p className="text-[11px] text-[#6A4D36] sm:text-xs">
                  <span className="hidden sm:inline">投稿されたデザインマンホール </span>
                  {designManholes != null && designManholes > 0 ? `${designManholes}枚` : ''}
                  <span className="ml-1 font-bold text-[#7B63A8] group-hover:underline">見る ›</span>
                </p>
              </div>
            </Link>
            )}
            </div>
          </section>
        )}

        {/*
          全部そろった後も投稿は集め続けているので、お礼で終わらせず「別の季節・2枚目」へつなぐ
          （北極星は初回投稿→2回目）。行き先は投稿。未ログインはログインを挟んで投稿へ戻す。
          ヒーローは行動のカードだけにしたいので、写真がまだないポケふたと同じく一番下に置く（2026-10-22）
        */}
        {feedSettled && allCollected && (
          <section className="mt-8">
            <Link
              href={isLoggedIn ? '/upload' : '/login?redirect=/upload'}
              className="group flex min-w-0 items-center gap-2 rounded-[8px] border border-[#E8A33D]/35 bg-white p-2.5 shadow-sm transition hover:shadow sm:gap-3 sm:p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF1D6] text-[#E8A33D] sm:h-12 sm:w-12">
                <Heart className="h-5 w-5 fill-current sm:h-6 sm:w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-extrabold text-[#4A4A4A] sm:text-base">
                  全国のポケふたに写真がそろいました<span className="max-sm:hidden">。ありがとう！</span>
                </span>
                <span className="block text-[11px] text-[#6A4D36] sm:text-xs">
                  別の季節や2枚目の写真も、まだまだ募集中
                  <span className="ml-1 font-bold text-[#7B63A8] group-hover:underline">›</span>
                </span>
              </span>
            </Link>
          </section>
        )}

        {/* 写真がまだないポケふた（募集枠なので、最新の投稿を見終わった一番下に置く） */}
        {feedSettled && !rareLoading && rareManholes.length > 0 && (
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
                const label = manholeDisplayName(manhole);
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
