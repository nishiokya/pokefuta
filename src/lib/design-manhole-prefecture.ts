import { PREFECTURE_BY_CODE, nearestPrefecture } from '@/lib/prefectures';

// デザインマンホールは都道府県を持っていないので、一覧の地図で県ごとに数えるために
// 緯度経度から県を引く。県庁所在地への近さだけだと県境で外れる（2026-11 の
// 100 件で 11 件: 函館→青森、南会津→栃木、嶺南→京都 など）ので、国土地理院の
// 逆ジオコーダーの市区町村コード（先頭2桁が県コード）を正とする。
const GSI_REVERSE_GEOCODER = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';

// 投稿の位置は後から変わらないので、ID ごとに覚えておけば温まった後は外へ問い合わせない
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 3000;
// 描画をこれ以上待たせない。間に合わなかった分は近い県で出し、裏で引き続き引いてキャッシュする
const DEFAULT_BUDGET_MS = 1500;

export interface LatLngWithId {
  id: string;
  latitude: number;
  longitude: number;
}

async function fetchPrefectureCode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`${GSI_REVERSE_GEOCODER}?lat=${lat}&lon=${lng}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: { muniCd?: string } };
    const code = body.results?.muniCd?.padStart(5, '0').slice(0, 2);
    return code && PREFECTURE_BY_CODE.has(code) ? code : null;
  } catch {
    return null;
  }
}

function lookup(item: LatLngWithId): Promise<string | null> {
  const existing = inflight.get(item.id);
  if (existing) return existing;
  const promise = fetchPrefectureCode(item.latitude, item.longitude).then((code) => {
    inflight.delete(item.id);
    if (code) cache.set(item.id, code);
    return code;
  });
  inflight.set(item.id, promise);
  return promise;
}

async function runPool(items: LatLngWithId[]) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await lookup(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

/**
 * 投稿 ID → 都道府県名。住所判定が時間内に返らなかった・海上などで引けなかったものは
 * 県庁所在地にいちばん近い県で埋める（必ず全件に値が入る）。
 */
export async function resolveDesignManholePrefectures(
  items: LatLngWithId[],
  budgetMs = DEFAULT_BUDGET_MS
): Promise<Record<string, string>> {
  const missing = items.filter((item) => !cache.has(item.id));
  if (missing.length > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      runPool(missing),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, budgetMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }

  const result: Record<string, string> = {};
  for (const item of items) {
    const code = cache.get(item.id);
    const pref = (code && PREFECTURE_BY_CODE.get(code)) || nearestPrefecture(item.latitude, item.longitude);
    result[item.id] = pref.name;
  }
  return result;
}
