'use client';

import dynamic from 'next/dynamic';
import type { DesignManhole } from '@/types/database';

// Leaflet は import 時に window を参照するため、サーバーコンポーネントの
// ページからは必ずこのラッパー経由（ssr: false）で読み込む
const DesignManholeMap = dynamic(
  () => import('@/components/DesignManhole/DesignManholeMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-full items-center justify-center rounded-lg bg-[#EFE5CE] sm:h-96">
        <span className="text-sm text-dm-line">地図を読み込み中...</span>
      </div>
    ),
  }
);

export default function MapSection({
  designManholes,
  prefectureById,
}: {
  designManholes: DesignManhole[];
  /** 渡すと引いた倍率で県ごとの枚数を出す（一覧用）。詳細ページは渡さずピンだけ */
  prefectureById?: Record<string, string>;
}) {
  return <DesignManholeMap designManholes={designManholes} prefectureById={prefectureById} />;
}
