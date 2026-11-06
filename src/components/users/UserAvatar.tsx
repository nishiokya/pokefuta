'use client';

import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';

// プロフィールのアイコン。本人が撮った公開写真の1枚を丸く切り抜いて出す。
// マンホールは丸いので、正方形の中央で切り抜けばほぼ蓋だけが残る。
//
// 写真は配信量を抑えるため小さい版（size=small）だけを使う。strict=1 で、縮小版が
// 無い写真は元画像に落とさず 404 にしてもらい、そのときは人のマークに切り替える。
// 未設定のときも人のマークを出す（今までの見た目と同じ）。

type Props = {
  photoId: string | null | undefined;
  /** 直径（px）。枠線を含む */
  size?: number;
  className?: string;
  alt?: string;
};

export function avatarPhotoUrl(photoId: string) {
  return `/api/photo/${encodeURIComponent(photoId)}?size=small&strict=1`;
}

export default function UserAvatar({ photoId, size = 48, className = '', alt = '' }: Props) {
  // 読めなかった写真ID。photoId が変われば（選び直し）もう一度試す
  const [failedId, setFailedId] = useState<string | null>(null);
  const showPhoto = Boolean(photoId) && failedId !== photoId;
  const imgRef = useRef<HTMLImageElement>(null);
  // サーバーで描画したページでは、React の準備より前に読み込みが失敗すると onError が
  // 呼ばれない。準備ができた時点で、読み終わっているのに中身が無ければ失敗として扱う
  useEffect(() => {
    const img = imgRef.current;
    if (photoId && img && img.complete && img.naturalWidth === 0) setFailedId(photoId);
  }, [photoId]);
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#bf5640]/40 bg-[#efe6cf] ${className}`}
      style={{ width: size, height: size }}
    >
      {showPhoto && photoId ? (
        <img
          ref={imgRef}
          src={avatarPhotoUrl(photoId)}
          onError={() => setFailedId(photoId)}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <UserRound className="text-[#8C6A4A]" style={{ width: size / 2, height: size / 2 }} aria-hidden />
      )}
    </span>
  );
}
