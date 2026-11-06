// 投稿者のアイコン（写真ID）をブラウザでまとめて取る。
// 同じ描画の間に頼まれた公開ID を1回のリクエストに束ね（/api/users/avatars は30件まで）、
// 結果はページを開いている間だけ覚えておく。取れなければ null（人のマークのまま）。

const MAX_PER_REQUEST = 30;
const cache = new Map<string, Promise<string | null>>();
let queue: Array<{ id: string; resolve: (photoId: string | null) => void }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchChunk(chunk: typeof queue) {
  const ids = Array.from(new Set(chunk.map((entry) => entry.id)));
  let avatars: Record<string, unknown> = {};
  try {
    const res = await fetch(`/api/users/avatars?ids=${ids.map(encodeURIComponent).join(',')}`);
    if (res.ok) avatars = ((await res.json()) as { avatars?: Record<string, unknown> }).avatars ?? {};
  } catch {
    // 取れなければアイコン無しで出す
  }
  for (const { id, resolve } of chunk) {
    const photoId = avatars[id];
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

export function loadPublicAvatarPhotoId(publicUserId: string): Promise<string | null> {
  const id = publicUserId.toLowerCase();
  let promise = cache.get(id);
  if (!promise) {
    promise = new Promise<string | null>((resolve) => queue.push({ id, resolve }));
    cache.set(id, promise);
    flushTimer ??= setTimeout(flush, 0);
  }
  return promise;
}
