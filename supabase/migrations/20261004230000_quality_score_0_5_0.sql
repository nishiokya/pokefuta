-- ---------------------------------------------------------------------------
-- 有効な採点の版を quality_score/0.5.0 に上げる（ai_tags.crop の蓋の枠を、学習した検出器の枠に替える）
--
-- k11 の manhole-score が、一覧の正方形の位置（ai_tags.crop / lid_fits）を決めるときの蓋の枠を、
-- OWL-ViT（学習なし）と Mac の CoreML の組み合わせから、写真館の写真で学習した検出器
-- （scripts/lid_detector.py、Faster R-CNN MobileNetV3）に替えた。学習に使っていない写真での当たり
-- （IoU 0.5 以上）は、Mac の正解 150 枚で OWL-ViT 139 → 150、手で描き直した難しい写真 43 枚で 15 → 43。
-- スコア・他のタグ・ai_tags の形は 0.4.0 と同じなので、apply_photo_scores は変えない。
--
-- 版を上げると全写真が未採点扱いになり、次のジョブで crop が入れ替わる。
-- 版を上げる前の k11 のジョブ（0.4.0）は読めず書けずに止まるので、適用後に k11 側を 0.5.0 に切り替える。
-- アプリの変更は無い。
-- 検査: npm run verify:photo-scorer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.active_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'quality_score/0.5.0'::text
$$;

ALTER FUNCTION scoring.active_version() OWNER TO postgres;
REVOKE ALL ON FUNCTION scoring.active_version() FROM PUBLIC, anon, authenticated, service_role;
