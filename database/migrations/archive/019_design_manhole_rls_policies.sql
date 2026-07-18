-- ============================================================
-- 019: design_manhole を既存 visit/photo と同じ RLS ポリシー方式に統一
-- ============================================================
-- 018 の「ポリシーゼロ + service role 経由」から、
-- 「anon キー + ユーザーセッション + RLS ポリシー」（既存投稿と同じ仕組み）へ変更。
-- service role キー（Amplify 未整備で本番障害の原因になった）への依存を撤廃する。
--
-- 直接 PostgREST を叩く経路も開くため、API 側にしかなかった検証を
-- DB の CHECK 制約・ポリシー条件・列権限で担保する。

-- ------------------------------------------------------------
-- 1) 業務制約を DB レベルへ（どの経路の書き込みにも効く）
-- ------------------------------------------------------------
ALTER TABLE public.design_manhole DROP CONSTRAINT IF EXISTS design_manhole_japan_bounds;
ALTER TABLE public.design_manhole ADD CONSTRAINT design_manhole_japan_bounds
  CHECK (latitude BETWEEN 20 AND 46 AND longitude BETWEEN 122 AND 154);

ALTER TABLE public.design_manhole DROP CONSTRAINT IF EXISTS design_manhole_title_length;
ALTER TABLE public.design_manhole ADD CONSTRAINT design_manhole_title_length
  CHECK (title IS NULL OR char_length(title) <= 100);

ALTER TABLE public.design_manhole DROP CONSTRAINT IF EXISTS design_manhole_description_length;
ALTER TABLE public.design_manhole ADD CONSTRAINT design_manhole_description_length
  CHECK (description IS NULL OR char_length(description) <= 1000);

ALTER TABLE public.design_manhole DROP CONSTRAINT IF EXISTS design_manhole_submitter_name_length;
ALTER TABLE public.design_manhole ADD CONSTRAINT design_manhole_submitter_name_length
  CHECK (submitter_name IS NULL OR char_length(submitter_name) <= 50);

-- 他プレフィックス（訪問写真 photos/original/ 等）のキーを指す行を作らせない
-- ＝ 写真配信 API を踏み台にした非公開画像の漏洩を DB で遮断
ALTER TABLE public.design_manhole DROP CONSTRAINT IF EXISTS design_manhole_storage_key_prefix;
ALTER TABLE public.design_manhole ADD CONSTRAINT design_manhole_storage_key_prefix
  CHECK (storage_key LIKE 'photos/design/original/%');

-- ------------------------------------------------------------
-- 2) RLS ポリシー（既存テーブルと同じ命名規約）
-- ------------------------------------------------------------
-- 読み: 公開行は誰でも。投稿者本人は自分の hidden 行も見える
DROP POLICY IF EXISTS design_manhole_public_select ON public.design_manhole;
CREATE POLICY design_manhole_public_select ON public.design_manhole
  FOR SELECT TO anon, authenticated
  USING (status = 'published' OR created_by = auth.uid());

-- 書き: ログインユーザーが自分名義の published 行のみ insert 可能
DROP POLICY IF EXISTS design_manhole_users_insert_own ON public.design_manhole;
CREATE POLICY design_manhole_users_insert_own ON public.design_manhole
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'published');

-- UPDATE / DELETE ポリシーは意図的に作らない:
--   - 投稿者が hidden 化（モデレーション）を巻き戻せないようにする
--   - 編集・削除が必要になったら管理者（Dashboard / service role）が行う

-- ------------------------------------------------------------
-- 3) 列権限: exif（端末機種・ソフトウェア情報を含む）は直接読ませない
-- ------------------------------------------------------------
REVOKE SELECT ON public.design_manhole FROM anon, authenticated;
GRANT SELECT (
  id, title, description, submitter_name,
  latitude, longitude,
  storage_provider, storage_key, content_type, file_size, width, height,
  status, created_by, created_at, updated_at
) ON public.design_manhole TO anon, authenticated;
