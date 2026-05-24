'use client';

import { useEffect, useRef } from 'react';
import { Share2 } from 'lucide-react';
import { SITE_NAME } from '@/lib/constants';
import { openSharePanel, prefectureCardShareText } from '@/lib/share';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type PrefectureCardShareButtonProps = {
  prefectureName: string;
  visited: number;
  total: number;
  complete: boolean;
  shareUrl: string;
};

export default function PrefectureCardShareButton({
  prefectureName,
  visited,
  total,
  complete,
  shareUrl,
}: PrefectureCardShareButtonProps) {
  const sharePanelCleanupRef = useRef<(() => void) | null>(null);
  const { trackShareClick, trackShareX, trackShareLine, trackCopyLink } = useAnalytics();

  useEffect(() => {
    return () => {
      sharePanelCleanupRef.current?.();
    };
  }, []);

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const shareText = prefectureCardShareText(prefectureName, visited, total, complete);

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
        console.error('Prefecture card share failed:', error);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={`${prefectureName}を共有`}
      className="absolute bottom-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[#6A4D36] shadow-sm transition hover:bg-white hover:text-[#4F3828] focus:outline-none focus:ring-2 focus:ring-[#DDA63A]/50"
    >
      <Share2 className="h-3.5 w-3.5" />
    </button>
  );
}
