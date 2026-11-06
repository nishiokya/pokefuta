'use client';

import { useEffect, useState } from 'react';

// ログイン中の人のアイコン（写真ID）。ヘッダーとスタンプ帳のトレーナー情報で使う。
// /api/user/avatar は本人向け（private, no-store）なので、ページを開いている間に1回だけ取り、
// /profile で選び直したら notifyOwnAvatarChanged() で開いている画面にすぐ反映する。

const EVENT = 'pokefuta:own-avatar-changed';
let shared: Promise<string | null> | null = null;

function loadOwnAvatarPhotoId(): Promise<string | null> {
  shared ??= fetch('/api/user/avatar')
    .then(async (res) => (res.ok ? ((await res.json()) as { photoId?: unknown }).photoId : null))
    .then((photoId) => (typeof photoId === 'string' && photoId ? photoId : null))
    .catch(() => null);
  return shared;
}

export function notifyOwnAvatarChanged(photoId: string | null) {
  shared = Promise.resolve(photoId);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: photoId }));
}

/** enabled が false（未ログイン）の間は取りに行かない。ログアウトしたら覚えた値を捨てる */
export function useOwnAvatarPhotoId(enabled: boolean): string | null {
  const [photoId, setPhotoId] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      shared = null;
      setPhotoId(null);
      return;
    }
    let cancelled = false;
    loadOwnAvatarPhotoId().then((loaded) => {
      if (!cancelled) setPhotoId(loaded);
    });
    const onChange = (event: Event) => setPhotoId((event as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT, onChange);
    };
  }, [enabled]);
  return photoId;
}
