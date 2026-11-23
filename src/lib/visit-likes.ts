// 訪問のいいね数と本人の状態を、ブラウザからまとめて取る（/api/visits/likes）。
// 同じ描画の間に頼まれた訪問を1回のリクエストに束ねる（public-avatars.ts と同じ形）。
// 覚えない：押した・外したの結果は pokefuta:photo-like のイベントで画面どうしが合わせる。

export const MAX_VISIT_LIKES_PER_REQUEST = 50;

export type VisitLikeState = { likes: number; userLiked: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `ids` クエリを訪問 id（uuid）の配列にする。形の違うものは捨て、重複は1つにする */
export function parseVisitIds(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter((id) => UUID_RE.test(id))
    )
  );
}

type Waiter = { id: string; resolve: (state: VisitLikeState | null) => void };
let queue: Waiter[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

type Fetcher = (url: string) => Promise<Response>;
let fetcher: Fetcher = (url) => fetch(url);

/** テスト用。fetch を差し替える */
export function setVisitLikesFetcherForTest(next: Fetcher | null) {
  fetcher = next ?? ((url) => fetch(url));
}

async function fetchChunk(chunk: Waiter[]) {
  const ids = Array.from(new Set(chunk.map((entry) => entry.id)));
  let likes: Record<string, VisitLikeState> | null = null;
  try {
    const res = await fetcher(`/api/visits/likes?ids=${ids.map(encodeURIComponent).join(',')}`);
    if (res.ok) likes = ((await res.json()) as { likes?: Record<string, VisitLikeState> }).likes ?? null;
  } catch {
    // 取れなかったら null（呼び出し側は 0 のまま見せる）
  }
  for (const { id, resolve } of chunk) {
    const state = likes?.[id];
    resolve(state ? { likes: Number(state.likes) || 0, userLiked: Boolean(state.userLiked) } : null);
  }
}

function flush() {
  flushTimer = null;
  const pending = queue;
  queue = [];
  for (let i = 0; i < pending.length; i += MAX_VISIT_LIKES_PER_REQUEST) {
    void fetchChunk(pending.slice(i, i + MAX_VISIT_LIKES_PER_REQUEST));
  }
}

/** 訪問1件のいいね状態。同じ描画の間の依頼はまとめて1回で取る。取れなければ null */
export function loadVisitLikeState(visitId: string): Promise<VisitLikeState | null> {
  const id = visitId.toLowerCase();
  const promise = new Promise<VisitLikeState | null>((resolve) => queue.push({ id, resolve }));
  flushTimer ??= setTimeout(flush, 0);
  return promise;
}
