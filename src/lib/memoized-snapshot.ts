const MEMO_TTL_MS = 60 * 60 * 1000;
const MEMO_RETRY_MS = 60 * 1000;

/**
 * 図鑑のスナップショットをサーバのメモリに持つ読み込み口を作る。
 *
 * `force-dynamic` / `fetchCache = 'force-no-store'` のページでは fetch の revalidate が効かず、
 * Amplify では Data Cache もインスタンスをまたいで当たらない。サーバのメモリに1時間持つ。
 * 取れなかったときも1分は覚えて、落ちている間に毎回待たせない（前に取れた分があればそれを返す）。
 * `timeoutMs` を渡すとその時間で見切る（取り込みは裏で続き、終われば次のリクエストから使われる）。
 * 取れたことが一度も無ければ null。
 */
export function memoizedSnapshot<T>(
  fetcher: () => Promise<T[] | null>
): (options?: { timeoutMs?: number }) => Promise<T[] | null> {
  let cache: { at: number; ttl: number; rows: T[] | null } | null = null;
  let inflight: Promise<T[] | null> | null = null;

  return async ({ timeoutMs } = {}) => {
    if (cache && Date.now() - cache.at < cache.ttl) return cache.rows;

    inflight ??= fetcher()
      .catch(() => null)
      .then((rows) => {
        cache = rows
          ? { at: Date.now(), ttl: MEMO_TTL_MS, rows }
          : { at: Date.now(), ttl: MEMO_RETRY_MS, rows: cache?.rows ?? null };
        return cache.rows;
      })
      .finally(() => {
        inflight = null;
      });

    if (timeoutMs === undefined) return inflight;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      return (await Promise.race([inflight, timeout])) ?? cache?.rows ?? null;
    } finally {
      clearTimeout(timer);
    }
  };
}

