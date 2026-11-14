'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import StampPhoto from '@/components/StampPhoto';
import { formatDistanceKm } from '@/lib/manhole-label';
import type { CoverPhoto } from '@/lib/manhole-cover-photos';

type Item = { id: number; label: string; distanceKm: number };

/**
 * デザインマンホール詳細の「近くのポケふた」。並びと距離はサーバで決め、写真だけブラウザで後から足す。
 * 写真は /api/manholes/cover-photos（CDN で共有キャッシュ）から。取れなければピンのまま。
 */
export default function NearbyPokefutaList({ items }: { items: Item[] }) {
  const [photos, setPhotos] = useState<Record<string, CoverPhoto>>({});
  const ids = items.map((item) => item.id).join(',');

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    fetch(`/api/manholes/cover-photos?ids=${ids}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { success?: boolean; photos?: Record<string, CoverPhoto> } | null) => {
        if (!cancelled && data?.success && data.photos) setPhotos(data.photos);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ id, label, distanceKm }) => {
        const photo = photos[String(id)];
        return (
          <li key={id}>
            <Link
              href={`/manhole/${id}`}
              className="flex items-center gap-3 rounded-lg border border-dm-line/15 bg-white px-3 py-2.5 transition hover:bg-dm-line/5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EFE5CE]">
                {photo ? (
                  <StampPhoto src={photo.thumbnail_url} aiTags={photo.lid_crop} />
                ) : (
                  <MapPin className="h-4 w-4 text-dm-line/60" aria-hidden="true" />
                )}
              </span>
              {/* ラベルの末尾のポケモン名が肝なので truncate しない（ポケふた詳細と同じ） */}
              <span className="min-w-0 flex-1 text-sm font-bold leading-snug">{label}</span>
              <span className="shrink-0 text-xs font-bold text-[#2A2A2A]/50">{formatDistanceKm(distanceKm)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
