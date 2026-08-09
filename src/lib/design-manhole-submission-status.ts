/**
 * デザインマンホール投稿の一時停止スイッチ。
 *
 * 投稿が必ず失敗すると分かっているとき、`true` にして受付自体を止める。
 * 直らないと分かっている操作を利用者にやらせない（写真を選び、EXIF を解析し、
 * R2 へ上げてから失敗させる）ためのもので、`true` の間は
 *
 * - `/design-manholes/new` はフォームを描画せず告知だけ出す
 * - middleware は同ページを保護対象から外す（ログインさせた先が「投稿できません」を防ぐ）
 * - 一覧・詳細・`/upload` の投稿導線は `SubmitCta` 経由で停止表示になる
 * - `POST /api/design-manholes` は 503 と停止コードで即座に閉じる
 *
 * 2026-08-09 に一度使った。`20260808000000_design_manhole_nearby_review.sql` が
 * 本番DBに未適用のまま #198 のコードだけデプロイされ、`design_manhole` への INSERT が
 * 存在しない列を指して PGRST204 で全失敗していた（#204 で停止 → 本番へ適用して復旧）。
 *
 * 停止するときは理由と復旧条件をここに書く。ポケふた（/upload）側は別経路なので、
 * このスイッチの対象外。
 */
export const DESIGN_MANHOLE_SUBMISSION_SUSPENDED = false;

export const DESIGN_MANHOLE_SUBMISSION_SUSPENDED_CODE =
  'DESIGN_MANHOLE_SUBMISSION_SUSPENDED';

export const DESIGN_MANHOLE_SUBMISSION_SUSPENDED_MESSAGE =
  '不具合のため、デザインマンホールの投稿を一時停止しています。復旧までしばらくお待ちください。';
