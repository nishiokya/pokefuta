'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { avatarPhotoUrl } from '@/components/users/UserAvatar';
import { PUBLIC_AVATAR_EVENT, loadPublicAvatarPhotoId } from '@/lib/public-avatars';

/**
 * 投稿者名の前に出す小さなアイコン。公開ID を渡すと、その人が選んだアイコン（公開写真）を
 * 後から差し込む。未設定・取得前・読めなかったときは fallback（今までの人のマーク）のまま。
 * 1ページに何個置いても、取りに行くのはまとめて1回（src/lib/public-avatars.ts）。
 * photoId を直接渡したとき（サーバーで引けたとき）は取りに行かない。
 */
export default function PosterAvatar({
  publicUserId,
  photoId: givenPhotoId,
  size,
  fallback,
  className = '',
}: {
  publicUserId?: string | null;
  photoId?: string | null;
  size: number;
  fallback: ReactNode;
  className?: string;
}) {
  const [loadedPhotoId, setLoadedPhotoId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    if (givenPhotoId !== undefined || !publicUserId) return;
    let cancelled = false;
    loadPublicAvatarPhotoId(publicUserId).then((loaded) => {
      if (!cancelled) setLoadedPhotoId(loaded);
    });
    // 本人が /profile で選び直したら、開いている画面のその人のアイコンも差し替える
    const id = publicUserId.toLowerCase();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; photoId: string | null }>).detail;
      if (detail?.id === id) setLoadedPhotoId(detail.photoId);
    };
    window.addEventListener(PUBLIC_AVATAR_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PUBLIC_AVATAR_EVENT, onChange);
    };
  }, [publicUserId, givenPhotoId]);

  const photoId = givenPhotoId !== undefined ? givenPhotoId : loadedPhotoId;
  if (!photoId || failedId === photoId) return <>{fallback}</>;
  return (
    <img
      src={avatarPhotoUrl(photoId)}
      onError={() => setFailedId(photoId)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-full bg-[#EFE4CC] object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
