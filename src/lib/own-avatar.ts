'use client';

import { useEffect, useState } from 'react';

// ログイン中の人のアイコン（写真ID）。ヘッダーとスタンプ帳のトレーナー情報で使う。
// /api/user/avatar は本人向け（private, no-store）なので、ページを開いている間に1回だけ取り、
// /profile で選び直したら notifyOwnAvatarChanged() で開いている画面にすぐ反映する。

const EVENT = 'pokefuta:own-avatar-changed';
// undefined は「取れなかった」（未設定の null と分ける。図鑑と共有するクッキーを消さないため）。
// 覚えた値は取ったときの利用者ID と組にする。別タブで別の人にログインし直したとき、
// 前の人のアイコンを出したり、図鑑と共有するクッキーに「新しい人の ID.前の人の写真」を書いたりしない
type Shared = { userId: string | null; promise: Promise<string | null | undefined> };
let shared: Shared | null = null;

/** userId を渡すと、覚えている値がその人のものでなければ取り直す。省略時は覚えている値を使う */
export function loadOwnAvatarPhotoId(userId: string | null = null): Promise<string | null | undefined> {
  if (!shared || (userId !== null && shared.userId !== userId)) {
    shared = {
      userId,
      promise: fetch('/api/user/avatar')
        .then(async (res) => {
          if (!res.ok) return undefined;
          const photoId = ((await res.json()) as { photoId?: unknown }).photoId;
          return typeof photoId === 'string' && photoId ? photoId : null;
        })
        .catch(() => undefined),
    };
  }
  return shared.promise;
}

export function notifyOwnAvatarChanged(photoId: string | null) {
  shared = { userId: shared?.userId ?? null, promise: Promise.resolve(photoId) };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: photoId }));
}

/**
 * user が null / false（未ログイン）の間は取りに行かず、覚えた値を捨てる。
 * 利用者ID（文字列）を渡すと、人が替わったら取り直す。true はログイン中の誰か（ID が分からない画面用）
 */
export function useOwnAvatarPhotoId(user: string | boolean | null): string | null {
  const enabled = Boolean(user);
  const userId = typeof user === 'string' ? user : null;
  const [photoId, setPhotoId] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      shared = null;
      setPhotoId(null);
      return;
    }
    let cancelled = false;
    setPhotoId(null);
    loadOwnAvatarPhotoId(userId).then((loaded) => {
      if (!cancelled) setPhotoId(loaded ?? null);
    });
    const onChange = (event: Event) => setPhotoId((event as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT, onChange);
    };
  }, [enabled, userId]);
  return photoId;
}
