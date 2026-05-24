'use client';

import { useEffect, useRef } from 'react';
import { Share2 } from 'lucide-react';
import { SITE_NAME } from '@/lib/constants';
import { openSharePanel, prefectureProgressShareText } from '@/lib/share';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type PrefectureProgressShareButtonProps = {
  displayName: string;
  completedPrefectureCount: number;
  totalPrefectureCount: number;
  shareUrl: string;
};

export default function PrefectureProgressShareButton({
  displayName,
  completedPrefectureCount,
  totalPrefectureCount,
  shareUrl,
}: PrefectureProgressShareButtonProps) {
  const sharePanelCleanupRef = useRef<(() => void) | null>(null);
  const { trackShareClick, trackShareX, trackShareLine, trackCopyLink } = useAnalytics();

  useEffect(() => {
    return () => {
      sharePanelCleanupRef.current?.();
    };
  }, []);

  const handleShare = async () => {
    const shareText = prefectureProgressShareText(
      displayName,
      completedPrefectureCount,
      totalPrefectureCount
    );

    trackShareClick();

    try {
      if (navigator.share) {
        await navigator.share({
          title: SITE_NAME,
          text: shareText,
          url: shareUrl,
        });
        return;
      }

      sharePanelCleanupRef.current?.();
      sharePanelCleanupRef.current = openSharePanel(shareText, shareUrl, {
        onShareX: () => trackShareX(),
        onShareLine: () => trackShareLine(),
        onCopyLink: () => trackCopyLink(),
      });
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Prefecture progress share failed:', error);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[7px] bg-[#B5483C] px-4 py-3 text-sm font-extrabold text-white shadow-[0_6px_14px_rgba(181,72,60,0.22)] transition hover:bg-[#9F3D33] focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
    >
      <Share2 className="h-4 w-4" />
      達成状況を共有
    </button>
  );
}
