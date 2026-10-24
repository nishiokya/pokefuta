-- ---------------------------------------------------------------------------
-- 有効な採点の版を quality_score/0.9.0 に上げる（ai_tags.plush の判定モデルを学習し直したものに替える）
--
-- k11 の manhole-score のぬいぐるみの判定を、10/03 以降に貼った正解（約 600 枚増、ぬいぐるみの正例 79 → 270）で
-- 学習し直した。シーン（ai_tags.scene）は今のモデルのまま変えない（学習し直したシーンは代表写真を悪くしたので見送り）。
-- ai_tags.model は 'scene_attrs/2' になる。
--   新しい投稿 462 枚での比較: ぬいぐるみの再現 0.33 → 0.94、適合 0.91 → 0.86
--   本番の全写真（10/24 のバックアップ）では plush が 233 → 517 枚。人間の判定で、新たに付く写真の 97% が正しかった
--   代表写真が入れ替わる蓋は 0、風景タグの変化も 0
--   （比較回 2026-10-24-v3。数字と判定は k11 の manhole-score data/model_compare/ に残す）
-- スコア・ai_tags の形は 0.8.0 と同じなので、apply_photo_scores は変えない。
--
-- 版を上げると全写真が未採点扱いになり、次のジョブで plush / plush_score / plush_box / crop が入れ替わる。
-- 版を上げる前の k11 のジョブ（0.8.0）は読めず書けずに止まるので、適用後に k11 側を 0.9.0 に切り替える。
-- アプリの変更は無い。
-- 検査: npm run verify:photo-scorer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.active_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'quality_score/0.9.0'::text
$$;

ALTER FUNCTION scoring.active_version() OWNER TO postgres;
REVOKE ALL ON FUNCTION scoring.active_version() FROM PUBLIC, anon, authenticated, service_role;
