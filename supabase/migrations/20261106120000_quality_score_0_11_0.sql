-- ---------------------------------------------------------------------------
-- 有効な採点の版を quality_score/0.11.0 に上げる（人が「影あり」と付けた写真を代表写真の後ろに回す）
--
-- k11 の manhole-score は、人の正解が影ありの写真の ai_tags.rep_score から 30 を引く。
-- 学習した並べ方では影は約 0.9 点しか下がらず、蓋に人の影が入った写真が影の無い写真に勝って
-- 代表写真になっていた（9 か所）。1つの蓋の候補の点の開きは最大 27.3 なので、30 引けば
-- 影ありは同じ蓋の影なしの候補より必ず後ろになる。
--   比較: 全写真を 0.11.0 で採点し直した結果で、代表写真が入れ替わる蓋 31 / 482
--   （影が理由 9、採点の後に付いた人の正解などで動く 22）。31 か所すべてを人が判定し、
--   新が良い 26・旧が良い 5（5 か所とも影ではない方）で切り替えと判断した
--   （数字と判定は k11 の manhole-score data/model_compare/2026-11-05-shadow30-full）
--
-- スコア・ai_tags の形は 0.10.0 と同じなので、apply_photo_scores は変えない。
-- 版を上げると全写真が未採点扱いになり、次のジョブで rep_score などが付け直される。
-- 版を上げる前の k11 のジョブ（0.10.0）は読めず書けずに止まるので、適用後に k11 側を 0.11.0 に切り替える。
-- アプリの変更は無い。
-- 検査: npm run verify:photo-scorer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.active_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'quality_score/0.11.0'::text
$$;

ALTER FUNCTION scoring.active_version() OWNER TO postgres;
REVOKE ALL ON FUNCTION scoring.active_version() FROM PUBLIC, anon, authenticated, service_role;
