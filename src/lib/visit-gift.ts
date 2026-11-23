/**
 * 「このポケふたのギフトを配れます」の期限まわり（2026-11-23）。
 *
 * ポケふたは Pokémon GO のポケストップなので、回すとその場所の写真付きギフトが手に入る。
 * 訪れた人が印を付けると、マンホール詳細にトレーナーコードと一緒に並ぶ。
 *
 * - 期限は撮影日から {@link GIFT_DAYS} 日。DB の CHECK（visit_gift_until_window）と揃える
 * - マンホール詳細に出すのは新しい順に {@link GIFT_GIVERS_LIMIT} 人まで（get_manhole_gift_givers）
 */

export const GIFT_DAYS = 10;
export const GIFT_GIVERS_LIMIT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 撮影日時から「配れます」の期限を出す。撮影日時が読めなければ null。 */
export function giftUntilFor(shotAt: string | Date): Date | null {
  const time = new Date(shotAt).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + GIFT_DAYS * DAY_MS);
}

/** まだ印を付けられるか（撮影日から10日以内か）。 */
export function canOfferGift(shotAt: string | Date, now: Date = new Date()): boolean {
  const until = giftUntilFor(shotAt);
  return until !== null && until.getTime() > now.getTime();
}

/** 印が今も有効か。 */
export function isGiftActive(giftUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!giftUntil) return false;
  const time = new Date(giftUntil).getTime();
  return Number.isFinite(time) && time > now.getTime();
}

/**
 * 「あと N日」の N。切り上げなので、残り1時間でも「あと1日」。切れていれば 0。
 */
export function giftDaysLeft(giftUntil: string | null | undefined, now: Date = new Date()): number {
  if (!giftUntil) return 0;
  const time = new Date(giftUntil).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.ceil((time - now.getTime()) / DAY_MS));
}
