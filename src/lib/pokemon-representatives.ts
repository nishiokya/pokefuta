import 'server-only';

/**
 * ポケモンごとの代表マンホール（pokefuta-tracker の dataset/pokemon_representatives.json）。
 * manhole-ai の Tools/pokemon-rep で手で選んだもの。図鑑の Pages には出していないので
 * GitHub の raw から読み、1時間キャッシュする。取れなければ空（呼び出し側が最初の蓋で代える）。
 */
const REPRESENTATIVES_URL =
  'https://raw.githubusercontent.com/nishiokya/pokefuta-tracker/main/dataset/pokemon_representatives.json';
const TIMEOUT_MS = 2000;

export async function fetchPokemonRepresentatives(): Promise<Map<string, number>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(REPRESENTATIVES_URL, { next: { revalidate: 3600 }, signal: controller.signal });
    if (!res.ok) return new Map();
    const body = (await res.json()) as { representatives?: Record<string, unknown> };
    const result = new Map<string, number>();
    for (const [name, id] of Object.entries(body.representatives ?? {})) {
      if (typeof id === 'number' && Number.isInteger(id)) result.set(name, id);
    }
    return result;
  } catch {
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}
