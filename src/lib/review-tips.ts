/**
 * 口コミの旅情報チップ（「🅿️ 駐車場あり・口コミ3件・2026/11」）。
 *
 * 作るのは図鑑（pokefuta-tracker `apps/scraper/manhole_reviews.py`）で、公開訪問のひとこと
 * （visit.comment）の言い回しから集計し、`/api/manholes.json` の各蓋に `review_tips` として載せる。
 * 言い回しの判定を2か所に持たないため、写真館では作り直さずこれを読むだけにする。
 * 図鑑の詳細ページの「口コミから」と同じものが出る。
 *
 * 口コミが読めなかった日の生成では `review_tips` 自体が無い。そのときは何も出さない。
 */

export interface ReviewTip {
  key: string;
  /** 絵文字付きの表示名（例「🅿️ 駐車場あり」） */
  label: string;
  /** 根拠になった口コミの件数 */
  count: number;
  /** 根拠の中で一番新しい年月（JST、YYYY-MM）。分からなければ空 */
  latest: string;
}

export interface ReviewTips {
  tips: ReviewTip[];
  /** 出してよいひとことの件数（数字だけ・定型文を除いたもの） */
  reviewCount: number;
  /** まだ口コミに無い、旅で一番聞かれる情報。今は駐車場だけ */
  missing: 'parking' | null;
}

/** 駐車場の情報が無い蓋で、ひとことの入力欄の候補のうち目立たせるもの（VISIT_TIP_SUGGESTIONS の1つ） */
export const PARKING_SUGGESTION = '駐車場あり';

export const MISSING_PARKING_MESSAGE = '駐車場の情報がまだありません';

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** スナップショットの蓋（またはその `review_tips`）から読む。形が違うものは捨てる */
export function parseReviewTips(manhole: unknown): ReviewTips | null {
  if (!manhole || typeof manhole !== 'object') return null;
  const raw = (manhole as Record<string, unknown>).review_tips;
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.tips) || !isNonNegativeInt(body.review_count)) return null;
  const tips: ReviewTip[] = [];
  for (const item of body.tips) {
    if (!item || typeof item !== 'object') continue;
    const tip = item as Record<string, unknown>;
    if (typeof tip.key !== 'string' || typeof tip.label !== 'string' || !tip.label.trim()) continue;
    if (!isNonNegativeInt(tip.count) || tip.count === 0) continue;
    tips.push({
      key: tip.key,
      label: tip.label,
      count: tip.count,
      latest: typeof tip.latest === 'string' && /^\d{4}-\d{2}$/.test(tip.latest) ? tip.latest : '',
    });
  }
  return {
    tips,
    reviewCount: body.review_count,
    missing: body.missing === 'parking' ? 'parking' : null,
  };
}

/** チップの根拠の表示（「口コミ3件・2026/11」） */
export function reviewTipBasis(tip: ReviewTip): string {
  return tip.latest ? `口コミ${tip.count}件・${tip.latest.replace('-', '/')}` : `口コミ${tip.count}件`;
}

interface VisitLike {
  visit?: {
    id: string;
    is_own?: boolean;
    comment?: string | null;
    shot_at?: string;
    is_public?: boolean;
  } | null;
}

/**
 * 見ている人の訪問のうち、ひとことがまだ無いもの（撮影日の新しい順の先頭）。
 * 蓋の詳細で「次に来る人へ、ひとことを足しませんか」と頼む相手。無ければ null。
 * 同じ訪問の写真が何枚あっても訪問は1つとして扱う。
 */
export function ownVisitNeedingTip(photos: readonly VisitLike[]): { visitId: string; isPublic: boolean } | null {
  const candidates = new Map<string, { shotAt: string; isPublic: boolean }>();
  const commented = new Set<string>();
  for (const photo of photos) {
    const visit = photo.visit;
    if (!visit?.id || visit.is_own !== true) continue;
    if (visit.comment?.trim()) {
      commented.add(visit.id);
      continue;
    }
    if (!candidates.has(visit.id)) {
      candidates.set(visit.id, { shotAt: visit.shot_at ?? '', isPublic: visit.is_public !== false });
    }
  }
  let best: { visitId: string; shotAt: string; isPublic: boolean } | null = null;
  for (const [visitId, info] of candidates) {
    if (commented.has(visitId)) continue;
    if (!best || info.shotAt > best.shotAt) best = { visitId, ...info };
  }
  return best ? { visitId: best.visitId, isPublic: best.isPublic } : null;
}
