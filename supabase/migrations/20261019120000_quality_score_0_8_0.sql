-- ---------------------------------------------------------------------------
-- 有効な採点の版を quality_score/0.8.0 に上げる（ai_tags.plush の判定に、ぬいぐるみの枠を使う）
--
-- k11 の manhole-score は、ぬいぐるみらしさ（plush_score）が線に届いた写真だけを plush にしていたため、
-- 蓋の脇に小さく置いたぬいぐるみを落としていた（/photos/plush に出ない）。0.8.0 では、線に届かなくても
-- plush_score が 0.3 以上で、OWLv2 がぬいぐるみの枠を一定の大きさ以上で出した写真も plush にする。
-- 過去の写真では 23 枚が plush に増え、plush から外れる写真は無い。
-- スコア・他のタグ・ai_tags の形は 0.7.0 と同じなので、apply_photo_scores は変えない。
--
-- 版を上げると全写真が未採点扱いになり、次のジョブで plush / plush_box / crop が入れ替わる。
-- 版を上げる前の k11 のジョブ（0.7.0）は読めず書けずに止まるので、適用後に k11 側を 0.8.0 に切り替える。
-- アプリの変更は無い。
-- 検査: npm run verify:photo-scorer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.active_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'quality_score/0.8.0'::text
$$;

ALTER FUNCTION scoring.active_version() OWNER TO postgres;
REVOKE ALL ON FUNCTION scoring.active_version() FROM PUBLIC, anon, authenticated, service_role;
