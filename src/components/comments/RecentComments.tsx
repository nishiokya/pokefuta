'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, MessageCircle } from 'lucide-react';
import { formatDateJaJst } from '@/lib/date';
import type { RecentCommentKind } from '@/lib/recent-comments';

type RecentCommentItem = {
  kind: RecentCommentKind;
  content: string;
  created_at: string;
  manhole: {
    id: number;
    title: string | null;
    prefecture: string | null;
    municipality: string | null;
    building: string | null;
  };
  thumbnail_url: string | null;
};

/**
 * スマホで出す件数。1カラムの縦積みなので6件だと「最新の投稿」が1画面ぶん下がる。
 * 取得は PC と同じ6件のまま、4件目以降を md 未満で隠す。
 */
const MOBILE_VISIBLE = 3;

const KIND_LABEL: Record<RecentCommentKind, string> = {
  comment: '口コミ',
  photo_note: '写真のひとこと',
};

/**
 * トップの「最近の口コミ」。蓋の掲示板コメントと写真のひとことを新しい順に、
 * 蓋ごとに1件ずつ並べる。
 *
 * 本文はカードに直接出す（hover で出すフィードのプレビューと違い、スマホでも読める）。
 * 1件も無い・取得に失敗したときはセクションごと出さない。
 */
export default function RecentComments() {
  const [items, setItems] = useState<RecentCommentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/recent-comments?limit=6', { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled && data?.success && Array.isArray(data.items)) setItems(data.items);
      } catch (error) {
        console.error('Failed to load recent comments:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <MessageCircle className="h-5 w-5 text-[#7B63A8]" />
        最近の口コミ
      </h2>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => {
          const { manhole } = item;
          const place = manhole.building
            ? [manhole.municipality, manhole.building].filter(Boolean).join('・')
            : [manhole.prefecture, manhole.municipality].filter(Boolean).join(' ') || manhole.title || 'ポケふた';
          return (
            <li
              key={`${item.kind}-${manhole.id}`}
              className={index >= MOBILE_VISIBLE ? 'hidden md:block' : undefined}
            >
              <Link
                href={`/manhole/${manhole.id}`}
                className="flex h-full gap-3 rounded-[8px] border border-[#7B63A8]/15 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[6px] bg-[#FFF8EB]">
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#7B63A8]">
                      <MapPin className="h-6 w-6 opacity-80" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold text-[#2E2346]">{place}</div>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#3D3D3D]">
                    「{item.content}」
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-[#6B6B6B]">
                    <span className="rounded-[4px] bg-[#7B63A8]/10 px-1.5 py-0.5 text-[#7B63A8]">
                      {KIND_LABEL[item.kind]}
                    </span>
                    {formatDateJaJst(item.created_at)}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
