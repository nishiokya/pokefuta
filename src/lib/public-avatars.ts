// 投稿者のアイコン（写真ID）をブラウザでまとめて取る。
// 同じ描画の間に頼まれた公開ID を1回のリクエストに束ねる（/api/users/avatars は30件まで）。
//
// 覚えておくのは CDN と同じ5分だけ。クライアント遷移で戻ってきたときに、他の人が選び直した
// アイコンへ追いつけるようにする。取得に失敗したときは覚えない（次に描くときに取り直す）。
// 本人が /profile で選び直したときは setPublicAvatarPhotoId() で、開いている画面の同じ人の
// アイコンもその場で差し替える。

const MAX_PER_REQUEST = 30;
export const PUBLIC_AVATAR_TTL_MS = 5 * 60 * 1000;
export const PUBLIC_AVATAR_EVENT = 'pokefuta:public-avatar-changed';

type Entry = { promise: Promise<string | null>; expiresAt: number };
const cache = new Map<string, Entry>();
let queue: Array<{ id: string; resolve: (photoId: string | null) => void }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchChunk(chunk: typeof queue) {
  const ids = Array.from(new Set(chunk.map((entry) => entry.id)));
  let avatars: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`/api/users/avatars?ids=${ids.map(encodeURIComponent).join(',')}`);
    if (res.ok) avatars = ((await res.json()) as { avatars?: Record<string, unknown> }).avatars ?? null;
  } catch {
    // 下で覚えた分を捨てる
  }
  // 一時的な失敗を null として覚えると、再読み込みするまで戻らない。
  // 応答ごと取れなかったときと、サーバーで取れなかった人（avatars に入っていない）は覚えない
  for (const id of ids) {
    if (!avatars || !Object.prototype.hasOwnProperty.call(avatars, id)) cache.delete(id);
  }
  for (const { id, resolve } of chunk) {
    const photoId = avatars?.[id];
    resolve(typeof photoId === 'string' && photoId ? photoId : null);
  }
}

function flush() {
  flushTimer = null;
  const pending = queue;
  queue = [];
  for (let i = 0; i < pending.length; i += MAX_PER_REQUEST) {
    void fetchChunk(pending.slice(i, i + MAX_PER_REQUEST));
  }
}

export function loadPublicAvatarPhotoId(publicUserId: string, now: number = Date.now()): Promise<string | null> {
  const id = publicUserId.toLowerCase();
  const cached = cache.get(id);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = new Promise<string | null>((resolve) => queue.push({ id, resolve }));
  cache.set(id, { promise, expiresAt: now + PUBLIC_AVATAR_TTL_MS });
  flushTimer ??= setTimeout(flush, 0);
  return promise;
}

/** 本人が選び直したとき。覚えている値を差し替え、開いている画面の同じ人のアイコンにも知らせる */
export function setPublicAvatarPhotoId(publicUserId: string, photoId: string | null, now: number = Date.now()) {
  const id = publicUserId.toLowerCase();
  cache.set(id, { promise: Promise.resolve(photoId), expiresAt: now + PUBLIC_AVATAR_TTL_MS });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PUBLIC_AVATAR_EVENT, { detail: { id, photoId } }));
  }
}
