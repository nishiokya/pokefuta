import type { SnapshotManhole } from '@/lib/manhole-snapshot';

/**
 * 画面から蓋の全件を読む。
 *
 * まず data.pokefuta.com（GitHub Pages）の静的スナップショットを直接読み、
 * 取れなかったときだけ `/api/manholes` に戻る。
 *
 * `/api/manholes` は全482件・約720KBを毎回 Amplify の SSR で組み立てて返しており、
 * 2026年8〜9月の Amplify 料金の大半（SSR実行時間・転送量）はこれだった。
 * スナップショットは同じ内容を CDN から gzip（約77KB）で配り、`max-age=600` で
 * ブラウザにも残るので、画面をまたいでも取り直さない。CORS は `*`。
 *
 * `/api/manholes` 側はサーバで data.pokefuta.com → raw.githubusercontent.com の順に
 * 取りに行くので、GitHub Pages が落ちていても表示は今まで通りになる。
 *
 * 訪問状態（is_visited / last_visit）はスナップショットでは常に未訪問。
 * 訪問済みを描く画面（地図・近傍・訪問記録）は `/api/visits` から自分で重ねている。
 */

const STATIC_BASE =
  process.env.NEXT_PUBLIC_POKEFUTA_STATIC_BASE ?? 'https://data.pokefuta.com';
export const STATIC_MANHOLES_URL = `${STATIC_BASE}/api/manholes.json`;
export const API_MANHOLES_URL = '/api/manholes';

/** 静的スナップショットを待つ上限。超えたら `/api/manholes` に切り替える。 */
const STATIC_TIMEOUT_MS = 3000;

export interface ManholeListPayload {
  success: true;
  manholes: SnapshotManhole[];
  total: number;
  with_photos: number;
  /** どちらから読めたか。障害時に切り替わったことを追えるようにする。 */
  source: 'static' | 'api';
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function toPayload(data: unknown, source: ManholeListPayload['source']): ManholeListPayload | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  // 生成側がエラー内容の JSON を返している場合は使わない（サーバ側と同じ判定）
  if (body.success !== true || !Array.isArray(body.manholes)) return null;
  const manholes = body.manholes as SnapshotManhole[];
  return {
    success: true,
    // `/api/manholes` と同じ id 降順に揃える。生成側の並びに依存しない
    manholes: [...manholes].sort((a, b) => b.id - a.id),
    total: typeof body.total === 'number' ? body.total : manholes.length,
    with_photos: typeof body.with_photos === 'number' ? body.with_photos : 0,
    source,
  };
}

async function tryFetch(
  fetchImpl: FetchLike,
  url: string,
  source: ManholeListPayload['source'],
  timeoutMs?: number
): Promise<ManholeListPayload | null> {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return null;
    return toPayload(await res.json(), source);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 蓋の全件（id 降順）。両方とも取れなければ null。
 */
export async function fetchAllManholes(
  fetchImpl: FetchLike = (input, init) => fetch(input, init)
): Promise<ManholeListPayload | null> {
  const fromStatic = await tryFetch(fetchImpl, STATIC_MANHOLES_URL, 'static', STATIC_TIMEOUT_MS);
  if (fromStatic) return fromStatic;
  console.warn('Static manhole snapshot unavailable; falling back to /api/manholes');
  return tryFetch(fetchImpl, API_MANHOLES_URL, 'api');
}

/**
 * 写真がまだない蓋を新しい順に `limit` 件。
 * `/api/manholes?no_photos=true&limit=N` と同じ結果（filter の後で slice）。
 */
export function pickManholesWithoutPhotos(
  manholes: SnapshotManhole[],
  limit: number
): SnapshotManhole[] {
  return manholes
    .filter((manhole) => manhole.photo_count === 0)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}
