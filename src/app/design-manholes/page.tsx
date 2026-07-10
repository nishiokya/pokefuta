'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import type { DesignManhole } from '@/types/database';

const DesignManholeMap = dynamic(
  () => import('@/components/DesignManhole/DesignManholeMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-full items-center justify-center rounded-lg bg-[#EFE5CE] sm:h-96">
        <span className="text-sm text-[#7B63A8]">地図を読み込み中...</span>
      </div>
    ),
  }
);

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

export default function DesignManholesPage() {
  const [designManholes, setDesignManholes] = useState<DesignManhole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/design-manholes?limit=200');
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data?.error || '一覧の取得に失敗しました');
        }
        setDesignManholes(data.design_manholes ?? []);
      } catch (err: any) {
        setError(err?.message || '一覧の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <Header title="デザインマンホール" showDescriptionLink={false} />

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold sm:text-xl">みんなのデザインマンホール</h1>
            <p className="mt-1 text-sm text-[#2A2A2A]/70">
              ポケふた以外の、オンリーワンなデザインマンホールのコレクション
            </p>
          </div>
          <Link
            href="/design-manholes/new"
            className="flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
          >
            <Plus className="h-4 w-4" />
            投稿する
          </Link>
        </div>

        {error && (
          <p className="mt-5 rounded-lg border border-[#B5483C]/30 bg-[#B5483C]/10 p-3 text-sm text-[#B5483C]">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-5 flex h-72 items-center justify-center rounded-lg bg-[#EFE5CE]">
            <span className="text-sm text-[#7B63A8]">読み込み中...</span>
          </div>
        ) : designManholes.length === 0 ? (
          <div className="mt-5 rounded-lg border border-[#7B63A8]/15 bg-white/70 p-8 text-center">
            <p className="text-sm text-[#2A2A2A]/70">
              まだ投稿がありません。最初の1枚を投稿してみませんか？
            </p>
            <Link
              href="/design-manholes/new"
              className="mt-4 inline-block rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
            >
              投稿する
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <DesignManholeMap designManholes={designManholes} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {designManholes.map((dm) => (
                <div
                  key={dm.id}
                  className="overflow-hidden rounded-lg border border-[#7B63A8]/15 bg-white shadow-sm"
                >
                  <div className="aspect-square bg-[#EFE5CE]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dm.photo_url}
                      alt={dm.title || 'デザインマンホール'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-sm font-bold">
                      {dm.title || 'デザインマンホール'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#2A2A2A]/50">
                      {dm.submitter_name ? `${dm.submitter_name} ・ ` : ''}
                      {formatDate(dm.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
