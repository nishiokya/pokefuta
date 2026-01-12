'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera, ChevronLeft, ChevronRight, Heart, MapPin, MessageCircle } from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import { createBrowserClient } from '@/lib/supabase/client';

type FeedVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'title' | 'pokemons'> | null;
  shot_at: string;
  shot_location?: string | null;
  photos: Array<{
    id: string;
    thumbnail_url?: string;
  }>;
  likes_count: number;
  comments_count: number;
};

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalManholes, setTotalManholes] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const feedPerPage = 24;

  useEffect(() => {
    // ページタイトル設定
    document.title = 'ホーム - ポケふた訪問記録';

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

    loadFeed();
    loadSiteStats();
    loadManholeStats();
  }, []);

  useEffect(() => {
    loadFeed();
  }, [currentPage]);

  const loadFeed = async () => {
    try {
      const offset = (currentPage - 1) * feedPerPage;
      const response = await fetch(
        `/api/visits?with_photos=true&limit=${feedPerPage}&offset=${offset}`,
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

  const loadManholeStats = async () => {
    try {
      const response = await fetch('/api/manholes?limit=1');
      if (!response.ok) return;
      const data = await response.json();
      if (data?.success) {
        if (typeof data.total === 'number') setTotalManholes(data.total);
      }
    } catch {
      // ignore
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
    } catch {
      // ignore
    }
  };

  const formatShotAt = (shotAt: string) => {
    try {
      return new Date(shotAt).toLocaleDateString('ja-JP');
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-rpg-bgDark">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="font-pixelJp text-rpg-textGold">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <>
            {/* Hero (未ログイン時のみ) */}
            {!isLoggedIn && (
              <div className="rpg-window">
                <div className="text-center">
                  <h2 className="font-pixelJp text-lg text-rpg-textDark mb-3">ポケふた写真館</h2>
                  <p className="font-pixelJp text-sm text-rpg-textDark leading-relaxed">
                    全国各地に設置されている「ポケふた」の写真を集めています。 あなたも見つけたポケふたの写真を登録して、みんなとシェアしませんか？
                  </p>
                </div>
              </div>
            )}

            {/* Feed - 最近の公開投稿（API改修なし） */}
            <div className="rpg-window">
              <h2 className="text-sm font-bold font-pixelJp text-rpg-textDark mb-3">
                最近の投稿
              </h2>

              {feed.length === 0 ? (
                <div className="text-center py-8">
                  <p className="font-pixelJp text-sm text-rpg-textDark opacity-70 mb-4">
                    まだ投稿がありません
                  </p>
                  <Link href={isLoggedIn ? '/upload' : '/login'} className="rpg-button rpg-button-primary inline-flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    <span className="font-pixelJp">{isLoggedIn ? '写真を登録' : 'ログインして投稿'}</span>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {feed.map((visit) => {
                    const photo = visit.photos?.[0];
                    const title = `${visit.manhole?.prefecture || ''}${visit.manhole?.municipality || ''}`;
                    const idLabel = visit.manhole?.id ?? visit.manhole_id ?? '';
                    const locationLabel = title || visit.shot_location || '';
                    const manholeId = visit.manhole?.id ?? visit.manhole_id;
                    const to = manholeId ? `/manhole/${manholeId}` : `/visit/${visit.id}/photos`;

                    return (
                      <Link
                        key={visit.id}
                        href={to}
                        className="relative aspect-square bg-rpg-bgDark border-2 border-rpg-border overflow-hidden hover:border-rpg-yellow transition-colors focus:outline-none focus:ring-2 focus:ring-rpg-yellow"
                        aria-label={`${locationLabel}${idLabel ? `(${idLabel})` : ''} ${formatShotAt(visit.shot_at)} いいね${visit.likes_count} コメント${visit.comments_count}`}
                      >
                        {photo?.thumbnail_url ? (
                          <img
                            src={photo.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <MapPin className="w-6 h-6 text-rpg-textGold opacity-80" />
                          </div>
                        )}

                        {/* Top overlay: location + date */}
                        <div className="absolute top-0 left-0 right-0 bg-black/70 p-1">
                          <div className="font-pixelJp text-[10px] text-white truncate">
                            {locationLabel}{idLabel ? `(${idLabel})` : ''}
                          </div>
                          <div className="font-pixelJp text-[10px] text-white/80">
                            {formatShotAt(visit.shot_at)}
                          </div>
                        </div>

                        {/* Bottom overlay: reactions */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                          <div className="flex items-center justify-end gap-2 text-white">
                            <div className="flex items-center gap-1">
                              <Heart className="w-3.5 h-3.5" />
                              <span className="font-pixel text-[10px]">{visit.likes_count}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span className="font-pixel text-[10px]">{visit.comments_count}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sub info */}
            <div className="rpg-window">
              <h2 className="text-sm font-bold font-pixelJp text-rpg-textDark mb-3">サブ情報</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="font-pixel text-xl text-rpg-yellow">{totalManholes || '—'}</div>
                  <div className="font-pixelJp text-xs text-rpg-textDark">全ポケふた</div>
                </div>
                <div className="text-center">
                  <div className="font-pixel text-xl text-rpg-blue">{totalPosts ?? '—'}</div>
                  <div className="font-pixelJp text-xs text-rpg-textDark">全投稿</div>
                </div>
              </div>
              {/* ユーザ数はここに退避したい場合に使えるが、デフォルトでは表示しない */}
              {false && (
                <div className="mt-2 text-center">
                  <div className="font-pixelJp text-xs text-rpg-textDark opacity-70">ユーザ</div>
                  <div className="font-pixel text-xl text-rpg-yellow">{totalUsers ?? '—'}</div>
                </div>
              )}
            </div>

            {/* Feed Pagination */}
            {(currentPage > 1 || feed.length === feedPerPage) && (
              <div className="rpg-window">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="rpg-button p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="前のページ"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="font-pixel text-xs text-rpg-textDark opacity-70">{currentPage}</div>

                  <button
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    disabled={feed.length < feedPerPage}
                    className="rpg-button p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="次のページ"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}