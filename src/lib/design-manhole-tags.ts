import 'server-only';
import { EMPTY_TAG_DATA, parseDesignManholeTagData, type DesignManholeTagData } from '@/lib/design-manhole-tag-data';

/**
 * デザインマンホール投稿のタグを図鑑から読む（`api/design_manhole_tags.json`）。
 *
 * 一覧・タグのページは `fetchCache = 'force-no-store'` なので fetch のキャッシュが効かない。
 * 数KBの JSON をリクエストごとに取り直さないよう、サーバのメモリに TTL つきで持つ
 * （design-manhole-link.ts と同じ）。図鑑が遅い・落ちているときはタグを出さないだけで、ページは待たせない。
 */

const STATIC_BASE = process.env.POKEFUTA_STATIC_BASE ?? 'https://data.pokefuta.com';
const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 1500;

let cache: { at: number; data: DesignManholeTagData } | null = null;

async function fetchTagData(): Promise<DesignManholeTagData | null> {
  try {
    const res = await fetch(`${STATIC_BASE}/api/design_manhole_tags.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Design manhole tags fetch failed (${res.status})`);
      return null;
    }
    return parseDesignManholeTagData(await res.json());
  } catch (error) {
    console.error('Design manhole tags fetch error', error);
    return null;
  }
}

export async function loadDesignManholeTagData(): Promise<DesignManholeTagData> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const data = await fetchTagData();
    // 取れなかったときも短く覚えて、落ちている間に毎回 1.5 秒待たせない
    cache = { at: data ? Date.now() : Date.now() - TTL_MS + 60_000, data: data ?? cache?.data ?? EMPTY_TAG_DATA };
  }
  return cache.data;
}
