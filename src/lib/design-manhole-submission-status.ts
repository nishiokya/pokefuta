/**
 * デザインマンホール投稿の一時停止フラグ。
 *
 * 停止理由（2026-08-09）:
 * `supabase/migrations/20260808000000_design_manhole_nearby_review.sql` が本番DBに
 * 未適用のまま #198 のコードだけデプロイされ、`design_manhole` への INSERT が
 * 存在しない列（nearby_official_manhole_*）を指すため必ず失敗する。
 * 利用者には「投稿に失敗しました。時間をおいて再度お試しください」としか出ず、
 * 時間をおいても直らないので、原因が直るまで受付自体を止めて正直に告知する。
 *
 * 本番DBにマイグレーションを適用したら `false` に戻すこと。
 * ポケふた（/upload）側は同じ列を使わないため影響がなく、停止対象に含めない。
 */
export const DESIGN_MANHOLE_SUBMISSION_SUSPENDED = true;

export const DESIGN_MANHOLE_SUBMISSION_SUSPENDED_CODE =
  'DESIGN_MANHOLE_SUBMISSION_SUSPENDED';

export const DESIGN_MANHOLE_SUBMISSION_SUSPENDED_MESSAGE =
  '不具合のため、デザインマンホールの投稿を一時停止しています。復旧までしばらくお待ちください。';
