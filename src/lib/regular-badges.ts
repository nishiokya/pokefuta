/**
 * 投稿者名に付ける 🏆 LEGEND / 👑 MASTER（金）/ EXPLORER（シルバー）/ 🌱 ROOKIE（若葉）バッジ。
 *
 * 人を順位で並べるランキングは置かず、続けて来ている人に印を付けるだけにしている。
 * MASTER / EXPLORER の判定の線は公開しない（pokefuta-tracker の secret）ので、画面にも条件は書かない。
 * ROOKIE は初めて投稿してから1か月の人。来たばかりの人に気づいてもらうための印。
 * LEGEND は訪問したポケふたの枚数で決まる実績で、ほかのどの段階より優先する。
 * 枚数の線は目標として見せるため公開している（LEGEND_DESCRIPTION）。
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

export type RegularTier = 'legend' | 'crown' | 'regular' | 'rookie';

/** 公開ID（app_user.id）→ 段階 */
export type RegularBadges = ReadonlyMap<string, RegularTier>;

export const EMPTY_REGULAR_BADGES: RegularBadges = new Map();

export const REGULAR_BADGE_LABEL: Record<RegularTier, string> = {
  legend: '🏆 LEGEND',
  crown: '👑 MASTER',
  regular: 'EXPLORER',
  rookie: '🌱 ROOKIE',
};

/** LEGEND の線。tracker の export_app_snapshot.py の LEGEND_MIN_MANHOLES と同じ値にする */
export const LEGEND_MIN_MANHOLES = 100;

/** 判定の条件を見せてよいのは LEGEND だけ。ほかの段階は線が秘密なので説明を出さない */
export const LEGEND_DESCRIPTION = `ポケふたを${LEGEND_MIN_MANHOLES}枚以上訪問した人`;

const isTier = (v: unknown): v is RegularTier => typeof v === 'string' && Object.prototype.hasOwnProperty.call(REGULAR_BADGE_LABEL, v);

export function parseRegularBadges(data: unknown): RegularBadges {
  if (!data || typeof data !== 'object') return EMPTY_REGULAR_BADGES;
  const body = data as Record<string, unknown>;
  if (body.success !== true || !body.users || typeof body.users !== 'object') {
    return EMPTY_REGULAR_BADGES;
  }
  const tiers = new Map<string, RegularTier>();
  for (const [id, tier] of Object.entries(body.users as Record<string, unknown>)) {
    if (isTier(tier)) tiers.set(id, tier);
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
