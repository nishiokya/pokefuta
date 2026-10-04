-- ---------------------------------------------------------------------------
-- 代表写真の正方形の切り抜き位置（crop）と、蓋がそこに収まるか（lid_fits）を ai_tags に足す
--
-- 判定は k11 の manhole-score（蓋の枠: OWL-ViT・Mac の CoreML・写真チェックで手で描いた枠）。
--   crop      [x0, y0, x1, y1]（0〜1、左上が原点、表示の向き）。一辺が写真の短辺の正方形を、
--             蓋の枠の中心に寄せて置いたもの。ぬいぐるみの写真は蓋と写真の中心の中間に寄せる。
--             蓋の枠が無い写真には付けない（真ん中の正方形のまま）
--   lid_fits  蓋の枠のはみ出しが crop の正方形の外に 10% 以下。蓋が画面より大きいアップは false。
--             枠が無ければ付けない
-- 例: {"model": "scene_attrs/1", "scene": "centered_clean", ..., "crop": [0.1235, 0, 0.8735, 1], "lid_fits": true}
--
-- 写真館は crop を一覧の正方形の object-position に使い（画像は作らない）、代表写真の並びで
-- 採点済み候補の中だけ「中心かつ lid_fits」を先にする（src/lib/manhole-photo-ranking.ts）。
-- crop の無い写真は今までどおり真ん中の正方形。
--
-- 有効な版を quality_score/0.4.0 に上げる。全写真が未採点扱いになり、次のジョブで crop が入る。
-- スコアと ai_tags の他のキーの計算は 0.3.0 と同じ。
-- 版を上げる前の k11 のジョブ（0.3.0）は読めず書けずに止まるので、適用後に k11 側を 0.4.0 に切り替える。
-- アプリは crop が無くても動くので、アプリとの適用順はどちらでもよい。
-- 試算: manhole-ai Tools/photo-check/rep_crops.py（写真チェック k11:8766/rep）
-- 検査: npm run verify:photo-scorer
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.photo.ai_tags IS
  'k11 manhole-score が判定したタグ（scene / plush / plush_score / night / model / crop / lid_fits）。scoring.apply_photo_scores だけが書く。アプリ・利用者からは書き換えられない（photo_protect_quality_score）';

-- ---------------------------------------------------------------------------
-- 有効な版を上げる（STABLE と search_path は 20260927100000 の注意どおり省かない）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.active_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'quality_score/0.4.0'::text
$$;

-- ---------------------------------------------------------------------------
-- 採点結果の書き込み（ai_tags を受け取れるようにする）
--
-- p_rows の各行に任意で "ai_tags": {...} を足せる。無い行は ai_tags を変えない。
-- ai_tags の中も型から厳密に検査する。知らないキー・値の範囲外・500バイト超は拒否。
-- 20261004100000 から crop と lid_fits を受け取れるようにしただけで、ほかは同じ。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.apply_photo_scores(
  p_version text,
  p_scored_at timestamptz,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  n_rows integer;
  n_updated integer;
BEGIN
  IF p_version IS NULL OR length(p_version) > 64
     OR p_version !~ '^[a-z_]+/[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'apply_photo_scores: 版の形が不正: %', left(p_version, 80);
  END IF;
  IF p_version IS DISTINCT FROM scoring.active_version() THEN
    RAISE EXCEPTION 'apply_photo_scores: % は有効な版ではない（有効な版は %）', p_version, scoring.active_version();
  END IF;
  IF p_scored_at IS NULL OR NOT isfinite(p_scored_at)
     OR p_scored_at > now() + interval '1 hour' OR p_scored_at < now() - interval '1 day' THEN
    RAISE EXCEPTION 'apply_photo_scores: 採点時刻が不正（未来・1日より前・無限）: %', p_scored_at;
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'apply_photo_scores: p_rows は配列';
  END IF;
  -- 5000 行 × 1行 300 バイト前後（ai_tags 込み）で 1.5MB。桁違いに大きいものは中身を見る前に断る
  IF octet_length(p_rows::text) > 2000000 THEN
    RAISE EXCEPTION 'apply_photo_scores: p_rows が大きすぎる（% バイト）', octet_length(p_rows::text);
  END IF;

  n_rows := jsonb_array_length(p_rows);
  IF n_rows > 5000 THEN
    RAISE EXCEPTION 'apply_photo_scores: 1回 5000 行まで（% 行）', n_rows;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE CASE
      WHEN jsonb_typeof(e) <> 'object' THEN true
      ELSE jsonb_typeof(e -> 'id') IS DISTINCT FROM 'string'
        OR length(e ->> 'id') > 36
        OR jsonb_typeof(e -> 'score') IS DISTINCT FROM 'number'
        OR jsonb_typeof(e -> 'eligible') IS DISTINCT FROM 'boolean'
        OR NOT (e ? 'expected_version' AND e ? 'expected_scored_at')
        OR jsonb_typeof(e -> 'expected_version') NOT IN ('string', 'null')
        OR length(e ->> 'expected_version') > 64
        OR jsonb_typeof(e -> 'expected_scored_at') NOT IN ('string', 'null')
        OR length(e ->> 'expected_scored_at') > 40
        OR (e ? 'ai_tags' AND jsonb_typeof(e -> 'ai_tags') IS DISTINCT FROM 'object')
        OR EXISTS (
          SELECT 1 FROM jsonb_object_keys(e) AS k
          WHERE k NOT IN ('id', 'score', 'eligible', 'expected_version', 'expected_scored_at', 'ai_tags')
        )
    END
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: 行の形が不正（id=文字列, score=数, eligible=真偽, expected_version / expected_scored_at=文字列か null, ai_tags=オブジェクト（任意）。ほかのキーは不可）';
  END IF;

  -- ai_tags の中身。CASE で先にオブジェクトであることを確かめてから中を見る
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE e ? 'ai_tags'
      AND CASE
        WHEN jsonb_typeof(e -> 'ai_tags') <> 'object' THEN true
        ELSE octet_length((e -> 'ai_tags')::text) > 500
          OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(e -> 'ai_tags') AS k
            WHERE k NOT IN ('model', 'scene', 'plush', 'plush_score', 'night', 'crop', 'lid_fits')
          )
          OR jsonb_typeof(e -> 'ai_tags' -> 'model') IS DISTINCT FROM 'string'
          OR length(e -> 'ai_tags' ->> 'model') > 40
          OR (e -> 'ai_tags' ? 'scene' AND (
                jsonb_typeof(e -> 'ai_tags' -> 'scene') IS DISTINCT FROM 'string'
                OR (e -> 'ai_tags' ->> 'scene') NOT IN ('centered_clean', 'wide_context', 'signage_info', 'landscape')))
          OR (e -> 'ai_tags' ? 'plush' AND jsonb_typeof(e -> 'ai_tags' -> 'plush') IS DISTINCT FROM 'boolean')
          OR (e -> 'ai_tags' ? 'night' AND jsonb_typeof(e -> 'ai_tags' -> 'night') NOT IN ('boolean', 'null'))
          -- 数に変換するのは数であると分かってから（OR の評価順は保証されない）
          OR (e -> 'ai_tags' ? 'plush_score' AND CASE
                WHEN jsonb_typeof(e -> 'ai_tags' -> 'plush_score') = 'number'
                  THEN (e -> 'ai_tags' ->> 'plush_score')::numeric NOT BETWEEN 0 AND 1
                ELSE true END)
          OR (e -> 'ai_tags' ? 'lid_fits' AND jsonb_typeof(e -> 'ai_tags' -> 'lid_fits') NOT IN ('boolean', 'null'))
          -- crop は 0..1 の数4つ [x0, y0, x1, y1]、x0 < x1・y0 < y1。数であると分かってから変換する
          OR (e -> 'ai_tags' ? 'crop' AND CASE
                WHEN jsonb_typeof(e -> 'ai_tags' -> 'crop') IS DISTINCT FROM 'array' THEN true
                WHEN jsonb_array_length(e -> 'ai_tags' -> 'crop') <> 4 THEN true
                WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e -> 'ai_tags' -> 'crop') AS v
                             WHERE jsonb_typeof(v) <> 'number') THEN true
                WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(e -> 'ai_tags' -> 'crop') AS v
                             WHERE v::numeric NOT BETWEEN 0 AND 1) THEN true
                ELSE (e -> 'ai_tags' -> 'crop' ->> 2)::numeric <= (e -> 'ai_tags' -> 'crop' ->> 0)::numeric
                  OR (e -> 'ai_tags' -> 'crop' ->> 3)::numeric <= (e -> 'ai_tags' -> 'crop' ->> 1)::numeric
                END)
      END
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: ai_tags の形が不正（model=文字列（必須）, scene=4種のどれか, plush=真偽, plush_score=0〜1, night=真偽か null, crop=0〜1 の数4つ（x0<x1, y0<y1）, lid_fits=真偽か null。500バイトまで。ほかのキーは不可）';
  END IF;

  -- 型の変換に失敗した行（id が uuid でない、時刻が読めない等）はここで例外になる
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(id uuid, score real, eligible boolean)
    WHERE r.score < 0 OR r.score > 1 OR r.score = 'NaN'::real
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: score は 0〜1';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT r.id)
    FROM jsonb_to_recordset(p_rows) AS r(id uuid, score real, eligible boolean)
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: id が重複している';
  END IF;

  UPDATE public.photo AS p
  SET quality_score = r.score,
      quality_eligible = r.eligible,
      quality_score_version = p_version,
      quality_scored_at = p_scored_at,
      ai_tags = coalesce(r.ai_tags, p.ai_tags)   -- ai_tags の無い行は変えない（null は上で弾いている）
  FROM jsonb_to_recordset(p_rows) AS r(id uuid, score real, eligible boolean,
                                      expected_version text, expected_scored_at timestamptz,
                                      ai_tags jsonb)
  WHERE p.id = r.id
    AND p.quality_score_version IS NOT DISTINCT FROM r.expected_version
    AND p.quality_scored_at IS NOT DISTINCT FROM r.expected_scored_at;
  GET DIAGNOSTICS n_updated = ROW_COUNT;

  RETURN n_updated;
END;
$$;

-- CREATE OR REPLACE は所有者と権限を引き継ぐが、20260927100000 と同じ形を名指しで確かめておく
ALTER FUNCTION scoring.active_version() OWNER TO postgres;
ALTER FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION scoring.active_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) TO photo_scorer;
