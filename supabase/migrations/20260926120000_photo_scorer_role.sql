-- ---------------------------------------------------------------------------
-- k11 の自動採点ジョブ専用のロール photo_scorer
--
-- 新着写真を k11（manhole-score）で採点し、photo.quality_* に書き戻す。
-- 仕様: vault inbox/dev/pokefuta/spec/2026-09-26 pokefuta 新着写真の自動採点フロー.md
--
-- **できることを2つの関数の呼び出しに絞る。**
--   * scoring.unscored_photos(版)            … 指定の版で採点されていない写真の一覧
--   * scoring.apply_photo_scores(版, 時刻, 行) … quality_* の4列だけを書く
-- テーブル・ビュー・他のスキーマへの権限は1つも渡さない。パスワードが漏れても
-- できるのは写真スコアの書き換えだけ。
--
-- テーブルに列単位で GRANT しない理由: photo の RLS ポリシーは全部 TO public で、
-- 中で visit と auth.uid() を参照している。専用ロールで photo を直接読み書きさせると
-- それらが評価され、visit への権限まで要る。関数（SECURITY DEFINER、所有者 postgres）に
-- 閉じ込めれば、ロール側は関数の引数と戻り値しか扱えない。
--
-- スキーマを public にしないのは、public の関数は PostgREST の /rpc に出るため。
-- scoring は API の公開スキーマ（config.toml の api.schemas）に含めない。
--
-- パスワードはここに書かない。本番では SQL Editor で1回だけ
--   ALTER ROLE photo_scorer WITH PASSWORD '...';
-- を流し、k11 の ~/.config/pokefuta-scorer/env（600）に置く。.env.local には置かない。
-- パスワード未設定のあいだは誰もログインできない。
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE ROLE photo_scorer LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 2;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER ROLE photo_scorer SET statement_timeout = '120s';

COMMENT ON ROLE photo_scorer IS
  'k11 manhole-score の自動採点ジョブ専用。scoring.unscored_photos / scoring.apply_photo_scores の EXECUTE のみ';

CREATE SCHEMA IF NOT EXISTS scoring;
REVOKE ALL ON SCHEMA scoring FROM PUBLIC;
GRANT USAGE ON SCHEMA scoring TO photo_scorer;

-- ---------------------------------------------------------------------------
-- 採点の対象: 指定の版で採点されていない写真（未採点・旧版）
-- 非公開の写真も含める（公開に切り替えた瞬間から正しく並ぶように）。
-- storage_key は R2 から原本を取るために返す。exif や visit の情報は返さない。
-- quality_score_version / quality_scored_at は書き戻すときの楽観ロックの鍵
-- （apply_photo_scores の expected_version / expected_scored_at）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.unscored_photos(p_version text, p_limit integer DEFAULT 1000)
RETURNS TABLE (id uuid, storage_key text, manhole_id integer, created_at timestamptz,
               quality_score_version text, quality_scored_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.storage_key, p.manhole_id, p.created_at, p.quality_score_version, p.quality_scored_at
  FROM public.photo AS p
  WHERE p.quality_score_version IS DISTINCT FROM p_version
  ORDER BY p.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
$$;

-- ---------------------------------------------------------------------------
-- 採点結果の書き込み
--
-- p_rows: [{"id": "<uuid>", "score": 0.83, "eligible": true,
--           "expected_version": <unscored_photos が返した quality_score_version | null>,
--           "expected_scored_at": <unscored_photos が返した quality_scored_at | null>}, ...]
-- 1回の呼び出しは1トランザクション。1行でも不正なら全部書かない。
-- 戻り値は実際に更新した行数。削除済みの写真と、下の楽観ロックで弾いた写真は数えない。
--
-- 楽観ロック: 読んだ時点から（版, 採点時刻）の組が変わっている行は書かない。
-- 版の切り替え時に採点ジョブが2本重なると、古い版のバッチが後から終わって
-- 新しい版の結果を上書きしうる（PR #274 の Codex レビュー）。採点時刻での比較は
-- 「古いバッチほど後に書く」ので効かない。読んだ値との一致で判定する。
-- 時刻だけを鍵にしないのは、呼び出し側が渡す時刻が偶然一致すると見分けられないため
-- （1トランザクション内の now() で実際に起きた）。版が違えば時刻が同じでも弾ける。
-- 弾かれた写真は、まだ自分の版で未採点なら次の回に拾われる。
-- photo_protect_quality_score トリガは anon / authenticated だけを止めるので、
-- 所有者（postgres）として動くこの関数は通る。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.apply_photo_scores(
  p_version text,
  p_scored_at timestamptz,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n_rows integer;
  n_updated integer;
BEGIN
  IF p_version IS NULL OR p_version !~ '^[a-z_]+/[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'apply_photo_scores: 版の形が不正: %', p_version;
  END IF;
  IF p_scored_at IS NULL OR p_scored_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'apply_photo_scores: 採点時刻が不正: %', p_scored_at;
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'apply_photo_scores: p_rows は配列';
  END IF;

  n_rows := jsonb_array_length(p_rows);
  IF n_rows > 5000 THEN
    RAISE EXCEPTION 'apply_photo_scores: 1回 5000 行まで（% 行）', n_rows;
  END IF;

  -- 型の変換に失敗した行（id が uuid でない、score が数でない等）はここで例外になる
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(id uuid, score real, eligible boolean)
    WHERE r.id IS NULL OR r.score IS NULL OR r.eligible IS NULL OR r.score < 0 OR r.score > 1
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: id / score(0〜1) / eligible が欠けた行がある';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE NOT (e ? 'expected_version' AND e ? 'expected_scored_at')
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: expected_version / expected_scored_at が無い行がある（未採点なら null を明示する）';
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
      quality_scored_at = p_scored_at
  FROM jsonb_to_recordset(p_rows) AS r(id uuid, score real, eligible boolean,
                                      expected_version text, expected_scored_at timestamptz)
  WHERE p.id = r.id
    AND p.quality_score_version IS NOT DISTINCT FROM r.expected_version
    AND p.quality_scored_at IS NOT DISTINCT FROM r.expected_scored_at;
  GET DIAGNOSTICS n_updated = ROW_COUNT;

  RETURN n_updated;
END;
$$;

REVOKE ALL ON FUNCTION scoring.unscored_photos(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scoring.unscored_photos(text, integer) TO photo_scorer;
GRANT EXECUTE ON FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) TO photo_scorer;
