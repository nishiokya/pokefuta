/**
 * 投稿者名に付ける称号。公開で訪問したポケふたの枚数（同じ蓋は1枚）で5段階に分ける。
 *
 *   🌱 ROOKIE 1枚 → 🧭 EXPLORER 10枚 → ⭐ RANGER 50枚 → 👑 MASTER 100枚 → 🏆 LEGEND 150枚
 *
 * 2026-10-25 に線を 30/50/100 から 50/100/150 へ上げた。それまでに届いていた人の段は tracker が下げない
 * （pokefuta-tracker の dataset/regular_tier_floors.json）。なので regulars.json の段は枚数より高いことがある。
 *
 * 2026-10-24 に「続けて来ている週の数（線は非公開）」から、目標として見せられる枚数の段に変えた。
 * 線は /badges に全部書く。人を順位で並べるランキングは置かず、届いた段の印を付けるだけにしている。
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

export type RegularTier = 'legend' | 'crown' | 'ranger' | 'regular' | 'rookie';

/** 公開ID（app_user.id）→ 段階 */
export type RegularBadges = ReadonlyMap<string, RegularTier>;

export const EMPTY_REGULAR_BADGES: RegularBadges = new Map();

export const REGULAR_BADGE_LABEL: Record<RegularTier, string> = {
  legend: '🏆 LEGEND',
  crown: '👑 MASTER',
  ranger: '⭐ RANGER',
  regular: '🧭 EXPLORER',
  rookie: '🌱 ROOKIE',
};

/** カードのような狭い場所で、ラベルの代わりに出すアイコン。名前は title / aria-label で伝える */
export const REGULAR_BADGE_ICON: Record<RegularTier, string> = {
  legend: '🏆',
  crown: '👑',
  ranger: '⭐',
  regular: '🧭',
  rookie: '🌱',
};

/** アイコンを抜いた名前（読み上げ・ツールチップ用） */
export const REGULAR_BADGE_NAME: Record<RegularTier, string> = {
  legend: 'LEGEND',
  crown: 'MASTER',
  ranger: 'RANGER',
  regular: 'EXPLORER',
  rookie: 'ROOKIE',
};

/**
 * 各段階に届く枚数（公開で訪問したポケふた、同じ蓋は1枚）。
 * tracker の export_app_snapshot.py の TIER_MIN_MANHOLES と同じ値にする。
 */
export const REGULAR_TIER_MIN_MANHOLES: Record<RegularTier, number> = {
  rookie: 1,
  regular: 10,
  ranger: 50,
  crown: 100,
  legend: 150,
};

/** 低い段から順に。/badges の梯子と「次の段まであと何枚」に使う */
export const REGULAR_TIERS_ASCENDING: readonly RegularTier[] = ['rookie', 'regular', 'ranger', 'crown', 'legend'];

export const LEGEND_MIN_MANHOLES = REGULAR_TIER_MIN_MANHOLES.legend;

export const regularTierDescription = (tier: RegularTier) =>
  `ポケふたを${REGULAR_TIER_MIN_MANHOLES[tier]}枚以上訪問した人`;

export const LEGEND_DESCRIPTION = regularTierDescription('legend');

/**
 * 公開で訪問した枚数から、今の段階（無ければ null）と次の段階を返す。
 * awarded は regulars.json に付いている段（線を上げる前に届いた人は枚数より高い）。高いほうを今の段にする
 */
export function regularTierForCount(
  count: number,
  awarded?: RegularTier | null,
): { current: RegularTier | null; next: RegularTier | null } {
  let current: RegularTier | null = null;
  for (const tier of REGULAR_TIERS_ASCENDING) {
    if (count >= REGULAR_TIER_MIN_MANHOLES[tier]) current = tier;
  }
  if (awarded && (!current || REGULAR_TIERS_ASCENDING.indexOf(awarded) > REGULAR_TIERS_ASCENDING.indexOf(current))) {
    current = awarded;
  }
  const next = REGULAR_TIERS_ASCENDING[current ? REGULAR_TIERS_ASCENDING.indexOf(current) + 1 : 0] ?? null;
  return { current, next };
}

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

/** LEGEND の人（写真館のトップの「この◯人に続け！」と /badges に出す）。名前順、枚数は持たない。写真は無いこともある */
export type RegularLegend = { id: string; name: string; photoId?: string };

export type RegularSnapshot = {
  badges: RegularBadges;
  legends: readonly RegularLegend[];
};

const EMPTY_SNAPSHOT: RegularSnapshot = { badges: EMPTY_REGULAR_BADGES, legends: [] };

export function parseRegularLegends(data: unknown): RegularLegend[] {
  if (!data || typeof data !== 'object') return [];
  const body = data as Record<string, unknown>;
  if (body.success !== true || !Array.isArray(body.legends)) return [];
  return body.legends.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { id, name, photo_id: photoId } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name) return [];
    return [typeof photoId === 'string' && photoId ? { id, name, photoId } : { id, name }];
  });
}

export async function fetchRegularSnapshot(fetchImpl: FetchLike = fetch): Promise<RegularSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATIC_TIMEOUT_MS);
  try {
    const res = await fetchImpl(STATIC_REGULARS_URL, { signal: controller.signal });
    if (!res.ok) return EMPTY_SNAPSHOT;
    const body = await res.json();
    return { badges: parseRegularBadges(body), legends: parseRegularLegends(body) };
  } catch {
    return EMPTY_SNAPSHOT;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRegularBadges(fetchImpl: FetchLike = fetch): Promise<RegularBadges> {
  return (await fetchRegularSnapshot(fetchImpl)).badges;
}
