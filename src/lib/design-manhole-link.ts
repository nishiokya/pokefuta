import 'server-only';

/**
 * デザインマンホール投稿 → 紐付いたキャラクターマンホール（ガンダム・アイマスなど）。
 *
 * 紐付けは図鑑（pokefuta-tracker）が持つ。人が写真を見て付けたもの（overrides の canonical_ref）と、
 * 50m 以内の候補が1か所だけのときの自動のもの。図鑑の Pages デプロイが
 * `api/design_manhole_links.json`（generate_character_work_pages.py）に書き出し、ここはそれを読むだけ。
 *
 * 投稿詳細は `fetchCache = 'force-no-store'` なので fetch のキャッシュが効かない。
 * 数KBの JSON をリクエストごとに取り直さないよう、サーバのメモリに TTL つきで持つ。
 * 図鑑が遅い・落ちているときは紐付けを出さないだけで、ページは待たせない。
 */

const STATIC_BASE = process.env.POKEFUTA_STATIC_BASE ?? 'https://data.pokefuta.com';
const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 1500;

export interface DesignManholeLink {
  ref: string;
  work: string;
  work_name: string;
  place: string;
  prefecture: string;
  city: string;
  /** 図鑑の設置場所の行（ガンダムは gmanhole_map.html#gundam-<id>、ほかは作品ガイドの #spot-<id>） */
  url: string;
  /** 作品ガイドのページ */
  guide_url: string;
  spots: number;
  spots_with_photo: number;
}

let cache: { at: number; links: Record<string, DesignManholeLink> } | null = null;

const isDexUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'data.pokefuta.com';
  } catch {
    return false;
  }
};

async function fetchLinks(): Promise<Record<string, DesignManholeLink> | null> {
  try {
    const res = await fetch(`${STATIC_BASE}/api/design_manhole_links.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Design manhole links fetch failed (${res.status})`);
      return null;
    }
    const data = (await res.json()) as { success?: boolean; links?: Record<string, DesignManholeLink> };
    return data.success === true && data.links ? data.links : null;
  } catch (error) {
    console.error('Design manhole links fetch error', error);
    return null;
  }
}

export async function loadDesignManholeLink(id: string): Promise<DesignManholeLink | null> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const links = await fetchLinks();
    // 取れなかったときも短く覚えて、落ちている間に毎回 1.5 秒待たせない
    cache = { at: links ? Date.now() : Date.now() - TTL_MS + 60_000, links: links ?? cache?.links ?? {} };
  }
  const link = cache.links[id];
  // 飛び先は図鑑だけ（JSON が壊れていても外のサイトへは飛ばさない）
  return link && isDexUrl(link.url) && isDexUrl(link.guide_url) ? link : null;
}
