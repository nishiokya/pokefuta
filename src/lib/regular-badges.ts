/**
 * トップ「最新の投稿」の投稿者名に付ける 👑 常連 / 常連 バッジ。
 *
 * 人を順位で並べるランキングは置かず、続けて来ている人に印を付けるだけにしている。
 * 判定の線は公開しない（pokefuta-tracker の secret）ので、画面にも条件は書かない。
 *
 * 判定は pokefuta-tracker の export_app_snapshot.py が日次で焼き、
 * data.pokefuta.com（GitHub Pages）の `/api/regulars.json` から直接読む。
 * `/api` を足して毎リクエスト集計すると Amplify の SSR 実行時間が増えるので、
 * あえてサーバを通さない。取れなかったときはバッジを出さないだけにする（飾りなので）。
 */

const STATIC_BASE =
  process.env.NEXT_PUBLIC_POKEFUTA_STATIC_BASE ?? 'https://data.pokefuta.com';
export const STATIC_REGULARS_URL = `${STATIC_BASE}/api/regulars.json`;

const STATIC_TIMEOUT_MS = 3000;

export type RegularTier = 'crown' | 'regular';

/** 公開ID（app_user.id）→ 段階 */
export type RegularBadges = ReadonlyMap<string, RegularTier>;

export const EMPTY_REGULAR_BADGES: RegularBadges = new Map();

export const REGULAR_BADGE_LABEL: Record<RegularTier, string> = {
  crown: '👑 常連',
  regular: '常連',
};

export function parseRegularBadges(data: unknown): RegularBadges {
  if (!data || typeof data !== 'object') return EMPTY_REGULAR_BADGES;
  const body = data as Record<string, unknown>;
  if (body.success !== true || !body.users || typeof body.users !== 'object') {
    return EMPTY_REGULAR_BADGES;
  }
  const tiers = new Map<string, RegularTier>();
  for (const [id, tier] of Object.entries(body.users as Record<string, unknown>)) {
    if (tier === 'crown' || tier === 'regular') tiers.set(id, tier);
  }
  return tiers;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchRegularBadges(fetchImpl: FetchLike = fetch): Promise<RegularBadges> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATIC_TIMEOUT_MS);
  try {
    const res = await fetchImpl(STATIC_REGULARS_URL, { signal: controller.signal });
    if (!res.ok) return EMPTY_REGULAR_BADGES;
    return parseRegularBadges(await res.json());
  } catch {
    return EMPTY_REGULAR_BADGES;
  } finally {
    clearTimeout(timer);
  }
}
