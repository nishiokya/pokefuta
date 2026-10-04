-- ---------------------------------------------------------------------------
-- photo に AI の判定タグ（ai_tags）を持たせ、k11 の自動採点ジョブが書けるようにする
--
-- 判定は k11 の manhole-score（scene_attrs/1）。アプリは計算しない。
--   scene        写り方。centered_clean / wide_context / signage_info / landscape
--   plush        ぬいぐるみ・フィギュアが写っている（学習した分類器。閾値は k11 側で決める）
--   plush_score  その確率 0〜1
--   night        撮影時刻と蓋の位置から求めた太陽高度が −6° 未満（市民薄明の後）
--   model        判定の版（例 'scene_attrs/1'）
-- 例: {"model": "scene_attrs/1", "scene": "wide_context", "plush": true, "plush_score": 0.93, "night": false}
--
-- 表示は写真館が「AI」の印を付けて出す（蓋詳細・トップ・人気・訪問一覧・写真の個別ページ）。
-- 投稿者の申告（is_landscape）を上書きしない。
-- 投稿者が外す操作（上書き用の列）はまだ作らない。外れが目立ったら足す。
--
-- 書き込み経路は scoring.apply_photo_scores だけ。関数の署名は変えない
-- （scoring.audit_photo_scorer は署名で照合しているので、変えると本番の採点ジョブが止まる）。
-- 有効な版を quality_score/0.3.0 に上げる。全写真が未採点扱いになり、翌朝のジョブで
-- 既存の写真にも ai_tags が入る（初回の流し込み用のマイグレーションは要らない）。
-- **アプリより先に適用する。** アプリは ai_tags を select するので、列が無いと写真の一覧が 500 になる。
-- 版を上げる前の k11 のジョブ（0.2.0）は読めず書けずに止まるので、適用後に k11 側を 0.3.0 に切り替える。
-- 仕様: vault inbox/dev/pokefuta/spec/2026-10-03 pokefuta 周辺写真の自動タグ案.md
-- 検査: npm run verify:photo-scorer
-- ---------------------------------------------------------------------------

ALTER TABLE public.photo
  ADD COLUMN IF NOT EXISTS ai_tags jsonb
    CONSTRAINT photo_ai_tags_object CHECK (ai_tags IS NULL OR jsonb_typeof(ai_tags) = 'object');

COMMENT ON COLUMN public.photo.ai_tags IS
  'k11 manhole-score が判定したタグ（scene / plush / plush_score / night / model）。scoring.apply_photo_scores だけが書く。アプリ・利用者からは書き換えられない（photo_protect_quality_score）';

-- 読み取り: 写真館がタグを出すので公開する（判定の中身だけで、個人に結びつく情報は入れない）
GRANT SELECT (ai_tags) ON public.photo TO anon, authenticated;

-- 利用者ごとの訪問一覧（/users/[id]/visits）は public_user_visit_card を読む。先頭写真の ai_tags を足す。
-- 列は末尾に足す（CREATE OR REPLACE VIEW は既存の列の並びを変えられない）。それ以外は 20260929100000 と同じ
CREATE OR REPLACE VIEW public.public_user_visit_card
WITH (security_invoker = false, security_barrier = true) AS
SELECT b.*, latest.id AS latest_photo_id,
  latest.created_at AS latest_photo_created_at,
  latest.is_landscape AS latest_photo_is_landscape,
  latest.ai_tags AS latest_photo_ai_tags
FROM public.public_user_visit_base b
LEFT JOIN LATERAL (
  SELECT p.id, p.created_at, p.is_landscape, p.ai_tags FROM public.photo p
  WHERE p.visit_id = b.id
  ORDER BY p.is_landscape ASC, p.created_at DESC NULLS LAST, p.id DESC
  LIMIT 1
) latest ON true;
REVOKE ALL ON public.public_user_visit_card FROM PUBLIC;
GRANT SELECT ON public.public_user_visit_card TO anon, authenticated, service_role;
COMMENT ON VIEW public.public_user_visit_card IS
  '公開訪問カード。蓋の写真を優先して最新1枚を返し、風景だけの場合は種別を明示する。先頭写真の AI タグも返す。';

-- ---------------------------------------------------------------------------
-- 利用者が書き換えられないようにする（quality_* と同じ扱い。理由は 20260925120000）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.photo_protect_quality_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.quality_score := NULL;
    NEW.quality_eligible := NULL;
    NEW.quality_score_version := NULL;
    NEW.quality_scored_at := NULL;
    NEW.ai_tags := NULL;
  ELSE
    NEW.quality_score := OLD.quality_score;
    NEW.quality_eligible := OLD.quality_eligible;
    NEW.quality_score_version := OLD.quality_score_version;
    NEW.quality_scored_at := OLD.quality_scored_at;
    NEW.ai_tags := OLD.ai_tags;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 有効な版を上げる（STABLE と search_path は 20260927100000 の注意どおり省かない）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.active_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'quality_score/0.3.0'::text
$$;

-- ---------------------------------------------------------------------------
-- 採点結果の書き込み（ai_tags を受け取れるようにする）
--
-- p_rows の各行に任意で "ai_tags": {...} を足せる。無い行は ai_tags を変えない。
-- ai_tags の中も型から厳密に検査する。知らないキー・値の範囲外・500バイト超は拒否。
-- それ以外は 20260927100000 と同じ（版・時刻・サイズ・型・楽観ロック）。
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
            WHERE k NOT IN ('model', 'scene', 'plush', 'plush_score', 'night')
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
      END
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: ai_tags の形が不正（model=文字列（必須）, scene=4種のどれか, plush=真偽, plush_score=0〜1, night=真偽か null。500バイトまで。ほかのキーは不可）';
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
