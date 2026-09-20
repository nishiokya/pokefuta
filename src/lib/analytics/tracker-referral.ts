import { PREFECTURE_SLUGS } from '../prefectureSlug';

const VALID_SLUGS = new Set(Object.values(PREFECTURE_SLUGS));
/** テーマslug（道の駅・離島など）。県と違って一覧は図鑑（tracker）側が持っており、
 *  テーマが増えるたびに写真館をデプロイし直すのは筋が悪いので、形だけを見る。 */
const TAG_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const STORAGE_KEY = 'pokefuta:tracker-referral:v1';
export const REFERRAL_TIMEOUT_MS = 30 * 60 * 1000;

type Referral = { prefecture?: string; tag?: string; lastActivityAt: number };
export type TrackerReferralParams = {
  source_app?: 'tracker';
  referral_prefecture?: string;
  referral_tag?: string;
};

/** タブ内の直近の図鑑流入。GA4のセッションそのものを再現するものではない。 */
export function createTrackerReferralStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  now: () => number = Date.now
) {
  let loaded = false;
  let observedSearch: string | undefined;
  let referral: Referral | undefined;

  return (search: string): TrackerReferralParams => {
    const time = now();
    if (!loaded) {
      loaded = true;
      try {
        const saved = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
        if (saved && Number.isFinite(saved.lastActivityAt) &&
            (saved.prefecture === undefined || VALID_SLUGS.has(saved.prefecture)) &&
            (saved.tag === undefined || TAG_PATTERN.test(saved.tag))) {
          referral = {
            prefecture: saved.prefecture,
            tag: saved.tag,
            lastActivityAt: saved.lastActivityAt,
          };
        }
      } catch { /* storageが使えない場合も、このページ内では保持する */ }
    }

    if (referral && (time - referral.lastActivityAt >= REFERRAL_TIMEOUT_MS ||
        time < referral.lastActivityAt)) referral = undefined;

    // 同じURL上のイベントで期限切れの流入を復活させない。
    if (search !== observedSearch) {
      observedSearch = search;
      const params = new URLSearchParams(search);
      if (params.get('from') === 'data') {
        const slug = params.get('pref');
        const tag = params.get('tag');
        referral = {
          prefecture: slug && VALID_SLUGS.has(slug) ? slug : undefined,
          tag: tag && TAG_PATTERN.test(tag) ? tag : undefined,
          lastActivityAt: time,
        };
      }
    }

    if (referral) referral.lastActivityAt = time;
    try {
      if (referral) storage.setItem(STORAGE_KEY, JSON.stringify(referral));
      else storage.removeItem(STORAGE_KEY);
    } catch { /* storageの拒否で閲覧・投稿を止めない */ }

    return referral ? {
      source_app: 'tracker',
      ...(referral.prefecture ? { referral_prefecture: referral.prefecture } : {}),
      ...(referral.tag ? { referral_tag: referral.tag } : {}),
    } : {};
  };
}

const stores = new WeakMap<Window, ReturnType<typeof createTrackerReferralStore>>();

export function getTrackerReferralParams(): TrackerReferralParams {
  if (typeof window === 'undefined') return {};
  let store = stores.get(window);
  if (!store) {
    // sessionStorageのgetter自体が例外になるブラウザにも対応する。
    store = createTrackerReferralStore({
      getItem: (key) => window.sessionStorage.getItem(key),
      setItem: (key, value) => window.sessionStorage.setItem(key, value),
      removeItem: (key) => window.sessionStorage.removeItem(key),
    });
    stores.set(window, store);
  }
  return store(window.location.search || '');
}
