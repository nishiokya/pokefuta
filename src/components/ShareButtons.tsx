'use client';

import { MessageCircle, Share2 } from 'lucide-react';
import { buildLineShareUrl, buildXShareUrl } from '@/lib/share';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import type { PokefutaEventParams } from '@/lib/analytics/gtag';
import { SITE_NAME } from '@/lib/constants';

interface ShareButtonsProps {
  shareText: string;
  shareUrl: string;
  hashtags?: string[];
  analyticsParams?: PokefutaEventParams;
  className?: string;
}

function showCopyToast(success: boolean) {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg shadow-lg font-pixelJp text-sm z-50 text-white ${success ? 'bg-[#4F3828]' : 'bg-rpg-red'}`;
  toast.textContent = success ? 'リンクをコピーしました' : 'コピーに失敗しました';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

export default function ShareButtons({
  shareText,
  shareUrl,
  hashtags = [],
  analyticsParams,
  className,
}: ShareButtonsProps) {
  const { trackShareClick, trackShareX, trackShareLine, trackCopyLink } = useAnalytics();

  const handleShareX = () => {
    trackShareClick(analyticsParams);
    trackShareX(analyticsParams);
    window.open(buildXShareUrl(shareText, shareUrl, hashtags), '_blank', 'noopener,noreferrer');
  };

  const handleShareLine = () => {
    trackShareClick(analyticsParams);
    trackShareLine(analyticsParams);
    window.open(buildLineShareUrl(shareUrl), '_blank', 'noopener,noreferrer');
  };

  const handleShare = async () => {
    trackShareClick(analyticsParams);
    try {
      if (navigator.share) {
        await navigator.share({ title: SITE_NAME, text: shareText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        trackCopyLink(analyticsParams);
        showCopyToast(true);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    }
  };

  return (
    <div className={`grid grid-cols-3 gap-2 ${className ?? ''}`}>
      <button
        onClick={handleShareX}
        className="inline-flex items-center justify-center gap-1 rounded-[8px] border border-[#2A2A2A]/20 bg-[#2A2A2A] px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-black"
      >
        <span className="font-pixel text-sm">X</span>
        で共有
      </button>
      <button
        onClick={handleShareLine}
        className="inline-flex items-center justify-center gap-1 rounded-[8px] border border-[#06C755]/30 bg-[#06C755] px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#05B34C]"
      >
        <MessageCircle className="h-4 w-4" />
        LINEで共有
      </button>
      <button
        onClick={handleShare}
        className="inline-flex items-center justify-center gap-1 rounded-[8px] border border-[#7B63A8]/25 bg-white px-3 py-2 text-xs font-extrabold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
      >
        <Share2 className="h-4 w-4" />
        共有
      </button>
    </div>
  );
}
