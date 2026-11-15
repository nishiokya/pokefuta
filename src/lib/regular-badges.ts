/**
 * 投稿者名に付ける称号。公開で訪問したポケふたの枚数（同じ蓋は1枚）で5段階に分ける。
 *
 *   🌱 ROOKIE 1枚 → 🧭 EXPLORER 10枚 → ⭐ RANGER 50枚 → 👑 MASTER 100枚 → 🏆 LEGEND 150枚
 *
 * 2026-10-25 に線を 30/50/100 から 50/100/150 へ上げた。届いていた段の据え置きは 2026-10-28 にやめ、
 * 今は枚数だけで決める（regulars.json の段と枚数から計算した段は、同じ日の時点なら一致する）。
 *
 * 2026-10-24 に「続けて来ている週の数（線は非公開）」から、目標として見せられる枚数の段に変えた。
 * 線は /badges に全部書く。人を順位で並べるランキングは置かず、届いた段の印を付けるだけにしている。
 *
 * 判定は pokefuta-tracker の export_app_snapshot.py が日次で焼き、
 * data.pokefuta.com（GitHub Pages）の `/api/regulars.json` から直接読む。
 * `/api` を足して毎リクエスト集計すると Amplify の SSR 実行時間が増えるので、
 * あえてサーバを通さない。取れなかったときはバッジを出さないだけにする（飾りなので）。
 *
 * regulars.json は1日1回なので、訪問した日の札は前の段のまま。ログイン中の本人の札だけは、
 * ブラウザで本人の公開訪問を数えて上書きする（src/lib/own-regular-tier.ts、PosterRegularBadge）。
 * スタンプ帳（MyBadgesPanel）やプロフィールの輪はその場の枚数で出しているので、本人から見て食い違わない。
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
 */
export function regularTierForCount(count: number): { current: RegularTier | null; next: RegularTier | null } {
  let current: RegularTier | null = null;
  for (const tier of REGULAR_TIERS_ASCENDING) {
    if (count >= REGULAR_TIER_MIN_MANHOLES[tier]) current = tier;
  }
  const next = REGULAR_TIERS_ASCENDING[current ? REGULAR_TIERS_ASCENDING.indexOf(current) + 1 : 0] ?? null;
  return { current, next };
}

/**
 * tracker が称号を付けない公開ID（運営者のアカウント、自分のサイトで自分にバッジを出さない）。
 * pokefuta-tracker の export_app_snapshot.py の REGULAR_EXCLUDED_PUBLIC_IDS と同じにする。
 * 本人の札をその場の枚数で上書きするときも、ここに入っている人には付けない。
 */
export const REGULAR_EXCLUDED_PUBLIC_IDS: ReadonlySet<string> = new Set([
  '08c2bb09-8aa0-44f7-8287-7b332a589f33',
]);

/** 公開の訪問の manhole_id から、称号に数える枚数（同じ蓋は1枚、蓋の無い訪問は数えない）。tracker と同じ数え方 */
export function countDistinctManholes(rows: readonly { manhole_id: number | null | undefined }[]): number {
  const ids = new Set<number>();
  for (const row of rows) {
    if (typeof row.manhole_id === 'number') ids.add(row.manhole_id);
  }
  return ids.size;
}

/**
 * 本人の札を、その場の枚数で決めた段にする（regulars.json は前日までの判定のため）。
 * 除外の人はそのまま（日次の判定にも載らない）。段が無ければ札を出さない。
 */
export function ownRegularTier(publicUserId: string, publicManholeCount: number): RegularTier | null {
  if (REGULAR_EXCLUDED_PUBLIC_IDS.has(publicUserId)) return null;
  return regularTierForCount(publicManholeCount).current;
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
