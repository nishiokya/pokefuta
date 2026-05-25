'use client';

import ShareButtons from '@/components/ShareButtons';

interface PhotoShareButtonsProps {
  shareText: string;
  shareUrl: string;
  hashtags: string[];
}

export default function PhotoShareButtons({ shareText, shareUrl, hashtags }: PhotoShareButtonsProps) {
  return (
    <div>
      <p className="font-pixelJp text-[10px] text-[#6A4D36] mb-1.5">この写真を共有する</p>
      <ShareButtons shareText={shareText} shareUrl={shareUrl} hashtags={hashtags} />
    </div>
  );
}
