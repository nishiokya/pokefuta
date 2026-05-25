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
    <ShareButtons label="達成状況を共有する" shareText={shareText} shareUrl={shareUrl} />
  );
}
