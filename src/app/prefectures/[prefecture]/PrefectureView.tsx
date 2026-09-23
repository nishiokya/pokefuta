'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { BookOpen, Camera, MapPin, Stamp, TrendingUp } from 'lucide-react';
import PCShell from '@/components/PCShell';
import VisitPhotoCard from '@/components/VisitPhotoCard';
import type { MappableManhole, MarkerStatus } from '@/components/Map/MapComponent';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { prefectureDexUrl } from '@/lib/prefectureSlug';
import type { PrefectureManhole, PrefectureOverview } from '@/lib/prefecture-page';
import { manholeDisplayName, manholeHeadingPlace } from '@/lib/manhole-label';

/**
 * `document.title` はここでは触らない。title / description / JSON-LD は
 * `page.tsx`（サーバ）だけが作る約束（`/manhole/[id]` と同じ）。
 */

const MapComponent = dynamic(() => import('@/components/Map/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB]">
      <div className="font-bold text-[#7B63A8]">
        地図を読み込み中<span className="rpg-loading"></span>
      </div>
    </div>
  ),
});

type FeedVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: {
    id: number;
    prefecture?: string | null;
    municipality?: string | null;
    building?: string | null;
    title?: string | null;
    pokemons?: string[] | null;
  } | null;
  shot_at: string;
  photos: Array<{ id: string; thumbnail_url?: string; url?: string }>;
  display_name?: string | null;
};

/**
 * 「この県の最新の投稿」で取りに行く件数。表示するのは先頭 FEED_SHOWN 件。
 *
 * `with_photos=true` の絞り込みは API がページングの**後**に掛けるので、
 * 欲しい枚数ちょうどを頼むと写真なしの記録に食われて並びが歯抜けになる。
 * 多めに取って、こちらで切る。
 */
const FEED_FETCH = 48;
const FEED_SHOWN = 12;


export default function PrefectureView({ overview }: { overview: PrefectureOverview }) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const { trackView, trackPrefectureOpen } = useAnalytics();

  const { prefecture } = overview;
  const dexUrl = prefectureDexUrl(prefecture);

  useEffect(() => {
    (async () => {
      let loggedIn = false;
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        loggedIn = Boolean(session?.user);
      } catch (error) {
        console.error('Session check error:', error);
      }
      setIsLoggedIn(loggedIn);
      trackView(
        `/prefectures/${prefecture}`,
        `${prefecture}のポケふた写真`,
        'prefecture',
        loggedIn
      );
      trackPrefectureOpen({ prefecture });
    })();

    (async () => {
      try {
        const response = await fetch(
          `/api/visits?prefecture=${encodeURIComponent(prefecture)}` +
            `&with_photos=true&order_by=created_at&limit=${FEED_FETCH}`,
          // トップのフィードと同じ。credentials を送ると API が「自分の記録だけ」に
          // 切り替わり、県の新着ではなく自分の投稿が並ぶ。
          { credentials: 'omit' }
        );
        if (!response.ok) throw new Error('Failed to load prefecture feed');
        const data = await response.json();
        if (!data?.success) throw new Error('Feed response was not success');
        setFeed(Array.isArray(data.visits) ? data.visits.slice(0, FEED_SHOWN) : []);
      } catch (error) {
        console.error('Failed to load prefecture feed:', error);
        setFeed([]);
      } finally {
        setFeedLoading(false);
      }
    })();
  }, [prefecture]);

  const mapManholes = useMemo<MappableManhole[]>(
    () =>
      [...overview.missingManholes, ...overview.photographedManholes].map((manhole) => ({
        id: manhole.id,
        latitude: manhole.latitude,
        longitude: manhole.longitude,
        title: manhole.title,
        prefecture: manhole.prefecture,
        city: manhole.city,
        municipality: manhole.municipality,
        pokemons: manhole.pokemons,
        photo_count: manhole.photoCount,
      })),
    [overview.missingManholes, overview.photographedManholes]
  );

  // この地図の軸は訪問状況ではなく「現地写真があるか」。バッジの文言で明示する。
  const markerStatus = useMemo<MarkerStatus>(
    () => ({
      of: (manhole) => (manhole.photo_count ?? 0) > 0,
      on: '✓ 写真あり',
      off: '? 写真がまだない',
    }),
    []
  );

  const handleManholeClick = useCallback(
    (manhole: MappableManhole) => router.push(`/manhole/${manhole.id}`),
    [router]
  );

  return (
    <div className="min-h-content safe-area-body pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <PCShell className="pb-10 pt-5 lg:pb-12 lg:pt-6">
        <main>
          {/* 見出しと進捗 */}
          <section className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-6 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-8 sm:py-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
              <MapPin className="h-3.5 w-3.5" />
              都道府県
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-normal sm:text-4xl">
              {prefecture}のポケふた写真
            </h1>
            <p className="mt-4 text-base font-medium leading-relaxed sm:text-lg">
              {overview.isComplete ? (
                <>
                  {prefecture}のポケふた{' '}
                  <span className="whitespace-nowrap">
                    <b>{overview.total}</b> 枚
                  </span>
                  は、すべてに現地写真が集まりました。
                </>
              ) : (
                <>
                  {prefecture}のポケふた{' '}
                  <span className="whitespace-nowrap">
                    <b>{overview.total}</b> 枚
                  </span>
                  のうち{' '}
                  <span className="whitespace-nowrap">
                    <b>{overview.withPhoto}</b> 枚
                  </span>
                  に写真が集まっています。残り{' '}
                  <span className="whitespace-nowrap">
                    <b className="text-[#B5483C]">{overview.missing}</b> 枚。
                  </span>
                </>
              )}
            </p>

            {/* 進捗バー。数字だけだと「あとどれくらい」が一目で入らない */}
            <div className="mt-4">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#7B63A8]/15">
                <div
                  className="h-full rounded-full bg-[#7B63A8] transition-all"
                  style={{ width: `${overview.coverage}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs font-bold text-[#6B6B6B]">
                写真コンプリート率 {overview.coverage}%
              </p>
            </div>
          </section>

          {/* 写真がまだないポケふた。このページの主役なので最初に置く */}
          {overview.missing > 0 ? (
            <section className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-extrabold">
                  <Stamp className="h-5 w-5 text-[#7B63A8]" />
                  写真がまだないポケふた
                </h2>
                <span className="text-sm font-bold text-[#B5483C]">
                  {overview.missing} 枚
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {overview.missingManholes.map((manhole) => (
                  <Link
                    key={manhole.id}
                    // 未ログインでも「どの蓋を選んだか」を落とさない。素の /login に送ると、
                    // ログイン後にトップへ出てしまい、この一覧まで戻って同じ蓋を探し直すことに
                    // なる。詳細ページの投稿ボタンと同じ形（/login?redirect=<投稿画面>）。
                    href={
                      isLoggedIn
                        ? `/upload?manhole_id=${manhole.id}`
                        : `/login?redirect=${encodeURIComponent(`/upload?manhole_id=${manhole.id}`)}`
                    }
                    className="flex items-center gap-2 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-3 py-2.5 text-sm font-bold text-[#4A4A4A] shadow-sm transition hover:border-[#7B63A8]/40 hover:bg-white"
                  >
                    <Camera className="h-4 w-4 shrink-0 text-[#7B63A8]" />
                    <span className="line-clamp-2 text-xs leading-snug">
                      {manholeDisplayName(manhole)}
                    </span>
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-center text-xs font-medium text-[#6B6B6B]">
                {isLoggedIn
                  ? 'タップすると、その場所の投稿画面へ進みます'
                  : 'ログインすると、ここから写真を投稿できます'}
              </p>
            </section>
          ) : (
            <section className="mt-6 rounded-[8px] border border-[#2D846C]/25 bg-[#EAF6F1] p-5 text-center">
              <p className="text-sm font-extrabold text-[#2D846C]">
                {prefecture}のポケふたは、全{overview.total}枚に写真が集まりました
              </p>
              <p className="mt-1 text-xs font-medium text-[#4A4A4A]">
                ここから先は、同じ蓋でも季節や時間帯の違う写真が歓迎されます。
              </p>
            </section>
          )}

          {/* 設置場所の地図 */}
          {overview.center && (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-extrabold">
                  <MapPin className="h-5 w-5 text-[#7B63A8]" />
                  {prefecture}の設置マップ
                </h2>
                <span className="text-sm font-bold text-[#6B6B6B]">
                  {mapManholes.length} 枚
                </span>
              </div>
              <div className="overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] shadow-sm">
                <MapComponent
                  center={overview.center}
                  zoom={overview.mapZoom}
                  manholes={mapManholes}
                  markerStatus={markerStatus}
                  onManholeClick={handleManholeClick}
                  minHeight={360}
                />
              </div>
              {/*
                色の意味を書いておく。マーカーの色は他ページ（/map・/nearby）では
                訪問状況を表しており、ここだけ軸が違う。

                見本の色は MapComponent の背景色だけでは合わない。globals.css の
                `.marker-visited` / `.marker-unvisited` が地図上のマーカーに filter を
                掛けており（#4ecdc4 は紫に回り、#ff6b6b は褪せて灰色になる）、素の色を
                置くと凡例だけ地図と違う色になる。同じ filter をここにも掛けて揃える。
              */}
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-[#6B6B6B]">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
                    style={{
                      background: '#4ecdc4',
                      filter: 'hue-rotate(90deg) saturate(1.2)',
                    }}
                  />
                  写真あり
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full ring-2 ring-[#34495E]"
                    style={{
                      background: '#ff6b6b',
                      opacity: 0.6,
                      filter: 'grayscale(0.5)',
                    }}
                  />
                  写真がまだない
                </span>
              </p>
            </section>
          )}

          {/* この県の最新の投稿 */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <TrendingUp className="h-5 w-5 text-[#7B63A8]" />
                {prefecture}の最新の投稿
              </h2>
            </div>
            {feedLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="font-bold text-[#7B63A8]">
                  読み込み中<span className="rpg-loading"></span>
                </div>
              </div>
            ) : feed.length === 0 ? (
              <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-6 text-center">
                <p className="text-sm font-bold text-[#4A4A4A]">
                  {prefecture}の写真はまだ公開されていません。
                </p>
                <p className="mt-1 text-xs font-medium text-[#6B6B6B]">
                  最初の1枚を投稿できます。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {feed.map((visit) => {
                  const photo = visit.photos?.[0];
                  const manhole = visit.manhole;
                  return (
                    <VisitPhotoCard
                      key={visit.id}
                      manholeId={visit.manhole_id ?? manhole?.id ?? 0}
                      thumbnailUrl={photo?.thumbnail_url || photo?.url}
                      // 県ページなので県名は省く（12枚すべてに「宮崎県」が付くと読めない）。
                      // 市区町村が無い蓋は県名に落とす。空文字のまま繋ぐと
                      // 「のポケふた」だけの見出しになる。
                      title={manhole ? manholeHeadingPlace(manhole) : 'ポケふた'}
                      date={formatDateJa(visit.shot_at)}
                      posterName={visit.display_name || undefined}
                      tags={(manhole?.pokemons || []).slice(0, 2)}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/*
            設置情報そのもの（市町村別の枚数・トリビア・会えるポケモン・近隣県）は
            図鑑が県ごとに持っている。こちらで作り直さず、そちらへ送る。
          */}
          {dexUrl && (
            <section className="mt-8">
              <a
                href={dexUrl}
                className="flex items-center justify-between gap-3 rounded-[8px] border border-[#7B63A8]/20 bg-white px-4 py-4 shadow-sm transition hover:border-[#7B63A8]/40"
              >
                <span className="flex items-center gap-2.5">
                  <BookOpen className="h-5 w-5 shrink-0 text-[#7B63A8]" />
                  <span>
                    {/*
                      文言は目的別に分ける。同じ「県を見る」でも、詳細ページは
                      設置情報（図鑑）、トップの残り県チップは写真の募集状況（このページ）、
                      ここは図鑑へ戻す導線。行き先が割れていても、何が得られるかで読み分けられる。
                    */}
                    <span className="block text-sm font-extrabold text-[#4A4A4A]">
                      市町村別の設置場所・登場ポケモンを図鑑で見る
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-[#6B6B6B]">
                      {prefecture}の行き方、トリビア、近くの都道府県
                    </span>
                  </span>
                </span>
                <span className="text-lg font-extrabold text-[#7B63A8]">›</span>
              </a>
            </section>
          )}
        </main>
      </PCShell>
    </div>
  );
}
