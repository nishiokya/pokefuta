/**
 * 設置が発表されたのに、まだ写真が届いていない（緯度経度が分からない）新しいポケふた。
 *
 * 公式サイト（local.pokemon.jp）に載っていない新作は、デザインマンホール投稿（kind=pokefuta）で
 * 写真を受け、写真の GPS から図鑑に仮番号で載せている。場所の一覧は図鑑（pokefuta-tracker の
 * dataset/provisional_wanted.json）が持ち、投稿が届いた場所を除いて data.pokefuta.com の
 * `/api/provisional-wanted.json` に日次で出す。regulars.json と同じく、サーバを通さず直接読む。
 * 取れなかったときはヒーローのカードを出さないだけにする。
 */

const STATIC_BASE =
  process.env.NEXT_PUBLIC_POKEFUTA_STATIC_BASE ?? 'https://data.pokefuta.com';
export const STATIC_NEW_POKEFUTA_WANTED_URL = `${STATIC_BASE}/api/provisional-wanted.json`;

const STATIC_TIMEOUT_MS = 3000;

/** 新しいポケふたの写真の投稿先（デザインマンホール投稿の「新しいポケふた」） */
export const NEW_POKEFUTA_UPLOAD_PATH = '/design-manholes/new?kind=pokefuta';

export type NewPokefutaWantedPrefecture = { prefecture: string; slug: string; count: number };
export type NewPokefutaWanted = { total: number; prefectures: NewPokefutaWantedPrefecture[] };

export const EMPTY_NEW_POKEFUTA_WANTED: NewPokefutaWanted = { total: 0, prefectures: [] };

export function parseNewPokefutaWanted(data: unknown): NewPokefutaWanted {
  if (!data || typeof data !== 'object') return EMPTY_NEW_POKEFUTA_WANTED;
  const list = (data as Record<string, unknown>).prefectures;
  if (!Array.isArray(list)) return EMPTY_NEW_POKEFUTA_WANTED;
  const prefectures = list.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { prefecture, slug, count } = entry as Record<string, unknown>;
    if (typeof prefecture !== 'string' || !prefecture) return [];
    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return [];
    return [{ prefecture, slug: typeof slug === 'string' ? slug : '', count }];
  });
  return { total: prefectures.reduce((sum, p) => sum + p.count, 0), prefectures };
}

/** 「群馬・高知」のように県を短く並べる（ヒーローのカードは幅が狭い） */
export function newPokefutaWantedLabel(wanted: NewPokefutaWanted): string {
  return wanted.prefectures.map((p) => p.prefecture.replace(/[県府都]$/, '')).join('・');
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchNewPokefutaWanted(fetchImpl: FetchLike = fetch): Promise<NewPokefutaWanted> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATIC_TIMEOUT_MS);
  try {
    const res = await fetchImpl(STATIC_NEW_POKEFUTA_WANTED_URL, { signal: controller.signal });
    if (!res.ok) return EMPTY_NEW_POKEFUTA_WANTED;
    return parseNewPokefutaWanted(await res.json());
  } catch {
    return EMPTY_NEW_POKEFUTA_WANTED;
  } finally {
    clearTimeout(timer);
  }
}
