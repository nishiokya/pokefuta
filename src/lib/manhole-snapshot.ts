import 'server-only';

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
  is_visited: boolean;
  last_visit: string | null;
  photo_count: number;
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

export function fetchSiteStatsSnapshot(): Promise<SiteStatsSnapshot | null> {
  return fetchSnapshotJson<SiteStatsSnapshot>('/api/site-stats.json');
}
