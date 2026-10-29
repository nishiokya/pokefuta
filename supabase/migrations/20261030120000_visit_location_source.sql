-- visit.location_source: 写真の位置情報の有無（位置情報なし投稿の印）
--
-- 背景（2026-10-29）:
--
-- Android のブラウザは、端末に撮ってある写真の位置情報（EXIF の GPS）を全部消す。
-- 写真を選んだ Android ユーザーの約4分の3が invalid_gps で投稿できずにいた。
-- マンホール詳細から入った投稿（どの蓋かは投稿者が選んでいる）に限り、
-- 位置情報が無くても受け付け、この印で運営が目で確かめる対象を引く。
--
--   'gps'  … 撮影位置（shot_location）がある（これまでの投稿はすべてこれ）
--   'none' … 撮影位置が無い
--
-- shot_location から自動で決まる生成列にする。visit は本人なら PostgREST で
-- 直接 INSERT / UPDATE できるので、アプリが送る値にすると印をごまかせる。
-- 生成列なら書き込み側は何も送らなくてよく、送ろうとするとエラーになる。
-- 値を足すとき（判定モデルで蓋を確かめた 'model' など）は、その時に列の定義を変える。
--
-- 公開しない: visit の SELECT は列単位の GRANT（20261012110000）なので、
-- この列は anon / authenticated から読めない。公開の写真に印は出さない（ユーザー決定）。
--
-- 適用順: このマイグレーションを先に本番へ当て、そのあとでアプリを出す。
-- 既存の行には shot_location が全部あるので、すべて 'gps' になる。旧アプリはそのまま動く。
--
-- ロールバック:
--   DROP INDEX IF EXISTS public.idx_visit_location_source_none;
--   ALTER TABLE public.visit DROP COLUMN IF EXISTS location_source;

ALTER TABLE public.visit
  ADD COLUMN location_source text
  GENERATED ALWAYS AS (CASE WHEN shot_location IS NULL THEN 'none' ELSE 'gps' END) STORED;

COMMENT ON COLUMN public.visit.location_source IS
  '撮影位置の有無（shot_location から自動で決まる）。gps=あり、none=なし（マンホール詳細から投稿者が蓋を選んだ。運営が目で確かめる）。公開しない。';

-- 運営の確認で「位置情報なしだけ」を新しい順に引く
CREATE INDEX idx_visit_location_source_none
  ON public.visit (created_at DESC)
  WHERE location_source = 'none';
