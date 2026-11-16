'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OwnDesignManhole } from '@/lib/own-design-manholes';

const STRIP_LIMIT = 6;

/**
 * スタンプ帳（/visits）の「投稿したデザインマンホール」の節。ログイン時だけ呼び、1枚以上あるときだけ出す。
 * 0枚・失敗時は何も出さない（ステッカーの枚数と同じく、取れなければ黙って省く）。
 * 親がログイン中にだけ描画する前提。未ログインで置かれても API が 401 を返すので何も出ない。
 */
export default function OwnDesignManholesStrip() {
  const [items, setItems] = useState<OwnDesignManhole[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/design-manholes/mine', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && body?.success && Array.isArray(body.design_manholes)) {
          setItems(body.design_manholes);
        }
      } catch {
        // 出さないだけ
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">🎨 投稿したデザインマンホール（{items.length}枚）</h2>
        <Link href="/visits/design-manholes" className="shrink-0 font-pixelJp text-xs font-bold text-[#7B63A8]">
          すべて見る →
        </Link>
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {items.slice(0, STRIP_LIMIT).map((item) => (
          <li key={item.id}>
            <Link
              href="/visits/design-manholes"
              aria-label={item.title || 'デザインマンホール'}
              className="block aspect-square overflow-hidden rounded-[8px] bg-[#EFE4CC]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.photo_url} alt="" width={200} height={200} loading="lazy" className="h-full w-full object-cover" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
