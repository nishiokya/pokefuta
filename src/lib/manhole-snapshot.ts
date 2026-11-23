import 'server-only';
import type { ManholeTitle } from '@/types/database';
import {
  parseDesignManholeNdjson,
  type SnapshotDesignManhole,
} from '@/lib/design-manhole-snapshot-parse';

export type { SnapshotDesignManhole };

/**
 * data.pokefuta.com (GitHub Pages) が日次で配信する静的スナップショットを読む。
 *
 * マンホールマスターとサイト統計はリクエスト毎に Supabase を読まず、
 * ここを経由して取得する（Supabase egress を PV 非依存にするため）。
 * 生成元: pokefuta-tracker リポジトリの bake-app-data.yml。
 */

const STATIC_BASE =
  process.env.POKEFUTA_STATIC_BASE ?? 'https://data.pokefuta.com';
const FALLBACK_BASE =
  'https://raw.githubusercontent.com/nishiokya/pokefuta-tracker/main/docs';

const REVALIDATE_SECONDS = 3600;

/** fetchSnapshotNames() の待ち時間の上限。キャッシュが効いていれば即座に返る。 */
const SNAPSHOT_NAMES_TIMEOUT_MS = 1500;

export interface SnapshotManhole {
  id: number;
  title: string;
  name: string;
  prefecture: string;
  municipality: string | null;
  city: string;
  latitude: number;
  longitude: number;
  pokemons: string[];
  // 称号（レアポケふた等）と住所。どちらもスナップショットに元から入っており、
  // 詳細ページの title / JSON-LD の PostalAddress がこれを読む。
  titles: ManholeTitle[];
  address: string | null;
  // 詳細ページが実際に読む項目。スナップショットは482件すべてに持っている。
  // 宣言せずインデックスシグネチャ経由で読むと `unknown` になり、型が守ってくれない。
  building: string | null;
  detail_url: string | null;
  official_url: string | null;
  is_visited: boolean;
  last_visit: string | null;
  photo_count: number;
  // スタンプ帳の「特徴」（テーマ）と /badges のテーマ一覧が読む
  hashtags?: string[] | null;
  [key: string]: unknown;
}

export interface ManholeSnapshot {
  success: boolean;
  generated_at: string;
  total: number;
  with_photos: number;
  manholes: SnapshotManhole[];
}

export interface SiteStatsSnapshot {
  success: boolean;
  generated_at: string;
  users: number;
  posts: number;
  manholes: number;
  manholes_with_photos: number;
  latest_photo_at: string | null;
  latest_user_at: string | null;
  latest_visit_at: string | null;
  posts_last_7d: number;
  posts_last_30d: number;
  auth_users: number | null;
  active_users_7d: number | null;
  manhole_comments: number;
  public_posts: number;
  private_posts: number;
  source: string;
}

async function fetchSnapshotJson<T>(path: string): Promise<T | null> {
  for (const base of [STATIC_BASE, FALLBACK_BASE]) {
    try {
      const res = await fetch(`${base}${path}`, {
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (res.ok) {
        const data = (await res.json()) as T & { success?: boolean };
        // 生成側がエラー内容の JSON を返している場合は配信しない
        if (data.success === true) {
          return data;
        }
        console.error(`Snapshot payload not successful: ${base}${path}`);
        continue;
      }
      console.error(`Snapshot fetch failed (${res.status}): ${base}${path}`);
    } catch (error) {
      console.error(`Snapshot fetch error: ${base}${path}`, error);
    }
  }
  return null;
}

export function fetchManholeSnapshot(): Promise<ManholeSnapshot | null> {
  return fetchSnapshotJson<ManholeSnapshot>('/api/manholes.json');
}

/**
 * 蓋1枚をスナップショットから引く。
 *
 * 詳細ページのメタ情報・JSON-LD はここを読む。クライアント側も同じスナップショットを
 * 直接（`fetchAllManholes()`、取れなければ `/api/manholes` 経由で）読んでいるので、
 * **サーバとクライアントで蓋の情報が食い違わない**。
 * Supabase の `manhole` テーブルは緯度経度を PostGIS の `location` でしか持たず
 * `city` 列も無いため、JSON-LD の geo を出せるのはこちらだけでもある。
 */
export async function fetchSnapshotManhole(id: number): Promise<SnapshotManhole | null> {
  const snapshot = await fetchManholeSnapshot();
  if (!snapshot?.manholes) return null;
  return snapshot.manholes.find((manhole) => manhole.id === id) ?? null;
}

/**
 * 蓋 id → 表示名（`name`）。**表示名の正本は図鑑が日次スナップショットで計算した `name`**
 * （pokefuta-tracker `display_names.py` の `place_label` / `place_ambiguous` から組み立てる）。
 * Supabase を直接引く API（訪問・口コミ）はこれで `name` を付けてから返す。
 * 写真館側で同じ規則を再実装すると、同じ自治体に複数枚あるときの区別
 * （「斑鳩町 興留7」「町田市（フシギダネ）」）などが図鑑とずれるため。
 * スナップショットが取れないときは空の Map を返す（表示側は title に落ちる）。
 */
export async function fetchSnapshotNames(
  timeoutMs = SNAPSHOT_NAMES_TIMEOUT_MS
): Promise<Map<number, string>> {
  // 名前は見た目だけの情報なので、data.pokefuta.com が遅い・落ちているときに
  // 訪問・口コミの API ごと待たせない。時間切れなら空の Map（表示は title に落ちる）
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const snapshot = await Promise.race([fetchManholeSnapshot(), timeout]);
    if (!snapshot) {
      console.warn(`Snapshot names unavailable within ${timeoutMs}ms; falling back to title`);
    }
    return new Map((snapshot?.manholes ?? []).map((manhole) => [manhole.id, manhole.name]));
  } finally {
    clearTimeout(timer);
  }
}

/** 蓋オブジェクトにスナップショットの `name` を足す。id が無い・見つからないときはそのまま。 */
export function withSnapshotName<T extends { id?: number | null }>(
  manhole: T | null | undefined,
  names: Map<number, string>
): (T & { name?: string }) | null | undefined {
  if (!manhole || typeof manhole.id !== 'number') return manhole;
  const name = names.get(manhole.id);
  return name ? { ...manhole, name } : manhole;
}

const MEMO_TTL_MS = 60 * 60 * 1000;
const MEMO_RETRY_MS = 60 * 1000;

/**
 * 図鑑のスナップショットをサーバのメモリに持つ読み込み口を作る。
 *
 * `force-dynamic` / `fetchCache = 'force-no-store'` のページでは fetch の revalidate が効かず、
 * Amplify では Data Cache もインスタンスをまたいで当たらない。サーバのメモリに1時間持つ。
 * 取れなかったときも1分は覚えて、落ちている間に毎回待たせない（前に取れた分があればそれを返す）。
 * `timeoutMs` を渡すとその時間で見切る（取り込みは裏で続き、終われば次のリクエストから使われる）。
 * 取れたことが一度も無ければ null。
 */
function memoizedSnapshot<T>(
  fetcher: () => Promise<T[] | null>
): (options?: { timeoutMs?: number }) => Promise<T[] | null> {
  let cache: { at: number; ttl: number; rows: T[] | null } | null = null;
  let inflight: Promise<T[] | null> | null = null;

  return async ({ timeoutMs } = {}) => {
    if (cache && Date.now() - cache.at < cache.ttl) return cache.rows;

    inflight ??= fetcher()
      .catch(() => null)
      .then((rows) => {
        cache = rows
          ? { at: Date.now(), ttl: MEMO_TTL_MS, rows }
          : { at: Date.now(), ttl: MEMO_RETRY_MS, rows: cache?.rows ?? null };
        return cache.rows;
      })
      .finally(() => {
        inflight = null;
      });

    if (timeoutMs === undefined) return inflight;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      return (await Promise.race([inflight, timeout])) ?? cache?.rows ?? null;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** 蓋の全件（`/api/manholes.json`）をメモリに持って返す */
export const loadCachedManholes = memoizedSnapshot<SnapshotManhole>(() =>
  fetchManholeSnapshot().then((snapshot) => snapshot?.manholes ?? null)
);

/** 公開中のデザインマンホール（`design_manholes.ndjson`）をメモリに持って返す */
export const loadCachedDesignManholeSnapshot = memoizedSnapshot<SnapshotDesignManhole>(
  () => fetchDesignManholeSnapshot()
);

export function fetchSiteStatsSnapshot(): Promise<SiteStatsSnapshot | null> {
  return fetchSnapshotJson<SiteStatsSnapshot>('/api/site-stats.json');
}

/**
 * 公開中のデザインマンホールの一覧（図鑑のスナップショット）。
 *
 * pokefuta-tracker の update-design-manholes.yml が毎日 /api/design-manholes を読んで
 * `design_manholes.ndjson` に書き出している。新しい投稿・非公開にした投稿が反映されるのは翌日。
 * 詳細ページの「近くのデザインマンホール」がここを読み、公開の全件を Supabase から毎回読まない
 * （全件で約70KB × 1日2千回が Egress のいちばん大きな塊だった。2026-11-23 の edge_logs で確認）。
 * 取れなければ null。
 */
export async function fetchDesignManholeSnapshot(): Promise<SnapshotDesignManhole[] | null> {
  for (const base of [STATIC_BASE, FALLBACK_BASE]) {
    try {
      const res = await fetch(`${base}/design_manholes.ndjson`, {
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (!res.ok) {
        console.error(`Design manhole snapshot fetch failed (${res.status}): ${base}`);
        continue;
      }
      return parseDesignManholeNdjson(await res.text());
    } catch (error) {
      console.error(`Design manhole snapshot fetch error: ${base}`, error);
    }
  }
  return null;
}
