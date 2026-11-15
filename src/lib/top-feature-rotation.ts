// 写真館トップの特集で、雪景色とぬいぐるみを1回ごとに交互に出す。
// 両方を並べると写真6枚と API 2本がフィードの写真より先に回線を使い、スマホの LCP が約1秒遅れた（2026-11-15 計測）。
// 前回どちらを出したかはブラウザの localStorage に覚える。読めない・書けない環境では毎回ランダムに選ぶ

export type RotatingFeature = 'snow' | 'plush';

export const TOP_FEATURE_STORAGE_KEY = 'pf_top_rotating_feature';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function otherFeature(feature: RotatingFeature): RotatingFeature {
  return feature === 'snow' ? 'plush' : 'snow';
}

// 前回と違う方を選び、今回の分を覚える。初めての人と覚えられない人は random で決める
export function pickRotatingFeature(storage: StorageLike | null, random: () => number = Math.random): RotatingFeature {
  let last: string | null = null;
  try {
    last = storage?.getItem(TOP_FEATURE_STORAGE_KEY) ?? null;
  } catch {
    last = null;
  }
  const pick: RotatingFeature =
    last === 'snow' || last === 'plush' ? otherFeature(last) : random() < 0.5 ? 'snow' : 'plush';
  try {
    storage?.setItem(TOP_FEATURE_STORAGE_KEY, pick);
  } catch {
    // 覚えられなければ次回もランダム
  }
  return pick;
}
