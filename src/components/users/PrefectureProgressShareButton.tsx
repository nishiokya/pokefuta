'use client';

import ShareButtons from '@/components/ShareButtons';
import { prefectureProgressShareText } from '@/lib/share';

type PrefectureProgressShareButtonProps = {
  completedPrefectureCount: number;
  totalPrefectureCount: number;
  shareUrl: string;
};

export default function PrefectureProgressShareButton({
  completedPrefectureCount,
  totalPrefectureCount,
  shareUrl,
}: PrefectureProgressShareButtonProps) {
  const shareText = prefectureProgressShareText(completedPrefectureCount, totalPrefectureCount);

  return (
    <div>
      <p className="font-pixelJp text-[10px] text-[#6A4D36] mb-1.5">達成状況を共有する</p>
      <ShareButtons shareText={shareText} shareUrl={shareUrl} />
    </div>
  );
}
