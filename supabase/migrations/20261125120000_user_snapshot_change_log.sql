-- 公開スタンプ帳のスナップショット（R2 の JSON）の鮮度を DB で判定する。
--
-- 背景: /users/[userId] は表示のたびに Supabase を約8本呼んでいた（egress の大半は本数由来）。
-- 公開データを R2 の JSON にまとめて読むが、非公開にした訪問・フレンド募集 OFF などの公開取り消しが
-- JSON に残ってはいけない。アプリの書き込み経路だけで JSON を消すやり方では、運用 SQL・マイグレーション・
-- 自動採点・審査（アプリを通らない変更）を拾えない。
--
-- やり方: 公開データの元になる表（visit / photo / app_user / design_manhole）の変更を、同じトランザクションで
-- 変更ログ（追記のみ）に記録する。公開IDごとの版（rev）はログの合計の組で、JSON に入れた rev と今の rev が
-- 同じときだけ JSON を使う。
--
-- - トリガは文単位（FOR EACH STATEMENT）で、遷移表の値だけを記録する。ほかの表を引かず、既存の行・表を
--   ロックしない（追記 INSERT だけ）。なので書き込み同士の待ち・デッドロックを新しく作らず、分離レベルにも依存しない。
-- - photo は持ち主を引かず visit_id で記録し、読む側が「その時点の持ち主の visit」で合計する。
--   持ち主の付け替え（名義訂正）と写真の書き込みがどの順でコミットしても、両方の後の持ち主の rev に入る。
-- - rev は「変更回数」ではなくキャッシュ失効用の値。同じ人が1文で何度記録されても（cascade など）構わない。
-- - 蓋のカタログ（manhole の名称・県）は記録しない。公開データだけなので JSON の寿命（アプリ側 24h）で反映する。
-- - 公開条件を変えるビュー・関数のマイグレーションは、最後に public.invalidate_all_user_snapshots() を呼ぶ。
--
-- 設計と影響範囲: PR #501。

-- ---------------------------------------------------------------------------
-- 1. 変更ログ
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_snapshot_change (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- どれか1つだけ入る。3つとも NULL は全員ぶん（TRUNCATE・invalidate_all_user_snapshots）
  auth_uid uuid,
  app_user_id uuid,
  visit_id uuid,
  -- 将来ログを圧縮する（N 行 → 重み N の1行）ときに合計を保つため
  weight integer NOT NULL DEFAULT 1 CHECK (weight > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_snapshot_change_one_key CHECK (num_nonnulls(auth_uid, app_user_id, visit_id) <= 1)
);
-- FK は付けない（FK 検査のロックで既存の書き込みを待たせない。消えた人・訪問の行は合計に入らないだけ）

CREATE INDEX user_snapshot_change_auth_uid_idx
  ON public.user_snapshot_change (auth_uid) INCLUDE (weight) WHERE auth_uid IS NOT NULL;
CREATE INDEX user_snapshot_change_app_user_id_idx
  ON public.user_snapshot_change (app_user_id) INCLUDE (weight) WHERE app_user_id IS NOT NULL;
CREATE INDEX user_snapshot_change_visit_id_idx
  ON public.user_snapshot_change (visit_id) INCLUDE (weight) WHERE visit_id IS NOT NULL;
CREATE INDEX user_snapshot_change_global_idx
  ON public.user_snapshot_change (id) INCLUDE (weight)
  WHERE auth_uid IS NULL AND app_user_id IS NULL AND visit_id IS NULL;

-- baseline の default privileges が anon / authenticated に ALL を付けるので、明示的に剥がす。
-- だれもこの表を直接読み書きしない（書くのはトリガ、読むのは下の SECURITY DEFINER 関数）
REVOKE ALL ON TABLE public.user_snapshot_change FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.user_snapshot_change_id_seq FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.user_snapshot_change ENABLE ROW LEVEL SECURITY;
-- ポリシーは作らない（RLS で全行拒否。表の権限を誤って戻しても読めない）

COMMENT ON TABLE public.user_snapshot_change IS
  '公開スタンプ帳スナップショットの失効用の変更ログ（追記のみ）。auth_uid を含むので外へ出さない。'
  ' 版は get_public_snapshot_rev / get_public_user_snapshot が合計して返す（PR #501）。';

-- ---------------------------------------------------------------------------
-- 2. トリガ関数（表ごとに1つ。INSERT / UPDATE / DELETE の遷移表を見る）
--
-- UPDATE は id で突き合わせず、「無視する列」を除いた行の集合で NEW EXCEPT OLD / OLD EXCEPT NEW を取り、
-- 両側の行から記録する（主キーを変えた行も拾う）。無視する列以外が1つでも変われば記録する（新しい列は既定で記録側）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_snapshot_log_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT n.user_id FROM new_rows AS n WHERE n.user_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT o.user_id FROM old_rows AS o WHERE o.user_id IS NOT NULL;
  ELSE
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT (c.j ->> 'user_id')::uuid
    FROM (
      (SELECT pg_catalog.to_jsonb(n) - 'updated_at'::text AS j FROM new_rows AS n
       EXCEPT SELECT pg_catalog.to_jsonb(o) - 'updated_at'::text FROM old_rows AS o)
      UNION ALL
      (SELECT pg_catalog.to_jsonb(o) - 'updated_at'::text FROM old_rows AS o
       EXCEPT SELECT pg_catalog.to_jsonb(n) - 'updated_at'::text FROM new_rows AS n)
    ) AS c
    WHERE c.j ->> 'user_id' IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_snapshot_log_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 持ち主は引かない（visit_id で記録し、読む側がその時点の持ち主で合計する）
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_snapshot_change (visit_id)
    SELECT DISTINCT n.visit_id FROM new_rows AS n WHERE n.visit_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_snapshot_change (visit_id)
    SELECT DISTINCT o.visit_id FROM old_rows AS o WHERE o.visit_id IS NOT NULL;
  ELSE
    -- 採点の書き込み（quality_*）だけの更新は公開面に出ないので記録しない。ai_tags は出るので記録する
    INSERT INTO public.user_snapshot_change (visit_id)
    SELECT DISTINCT (c.j ->> 'visit_id')::uuid
    FROM (
      (SELECT pg_catalog.to_jsonb(n) - ARRAY['quality_score', 'quality_eligible', 'quality_score_version', 'quality_scored_at']::text[] AS j
         FROM new_rows AS n
       EXCEPT SELECT pg_catalog.to_jsonb(o) - ARRAY['quality_score', 'quality_eligible', 'quality_score_version', 'quality_scored_at']::text[]
         FROM old_rows AS o)
      UNION ALL
      (SELECT pg_catalog.to_jsonb(o) - ARRAY['quality_score', 'quality_eligible', 'quality_score_version', 'quality_scored_at']::text[]
         FROM old_rows AS o
       EXCEPT SELECT pg_catalog.to_jsonb(n) - ARRAY['quality_score', 'quality_eligible', 'quality_score_version', 'quality_scored_at']::text[]
         FROM new_rows AS n)
    ) AS c
    WHERE c.j ->> 'visit_id' IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_snapshot_log_app_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- auth_uid（その人の訪問・デザインマンホールと同じ鍵）と公開ID（id）の両方に記録する。
  -- 公開ID と auth_uid の対応が変わっても、公開ID 側の合計が必ず増える
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT n.auth_uid FROM new_rows AS n WHERE n.auth_uid IS NOT NULL;
    INSERT INTO public.user_snapshot_change (app_user_id)
    SELECT DISTINCT n.id FROM new_rows AS n WHERE n.id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT o.auth_uid FROM old_rows AS o WHERE o.auth_uid IS NOT NULL;
    INSERT INTO public.user_snapshot_change (app_user_id)
    SELECT DISTINCT o.id FROM old_rows AS o WHERE o.id IS NOT NULL;
  ELSE
    WITH changed AS (
      (SELECT pg_catalog.to_jsonb(n) - 'updated_at'::text AS j FROM new_rows AS n
       EXCEPT SELECT pg_catalog.to_jsonb(o) - 'updated_at'::text FROM old_rows AS o)
      UNION ALL
      (SELECT pg_catalog.to_jsonb(o) - 'updated_at'::text FROM old_rows AS o
       EXCEPT SELECT pg_catalog.to_jsonb(n) - 'updated_at'::text FROM new_rows AS n)
    ), keys AS (
      SELECT DISTINCT (c.j ->> 'auth_uid')::uuid AS auth_uid, NULL::uuid AS app_user_id
        FROM changed AS c WHERE c.j ->> 'auth_uid' IS NOT NULL
      UNION
      SELECT DISTINCT NULL::uuid, (c.j ->> 'id')::uuid
        FROM changed AS c WHERE c.j ->> 'id' IS NOT NULL
    )
    INSERT INTO public.user_snapshot_change (auth_uid, app_user_id)
    SELECT k.auth_uid, k.app_user_id FROM keys AS k;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_snapshot_log_design_manhole()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT n.created_by FROM new_rows AS n WHERE n.created_by IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT o.created_by FROM old_rows AS o WHERE o.created_by IS NOT NULL;
  ELSE
    INSERT INTO public.user_snapshot_change (auth_uid)
    SELECT DISTINCT (c.j ->> 'created_by')::uuid
    FROM (
      (SELECT pg_catalog.to_jsonb(n) - 'updated_at'::text AS j FROM new_rows AS n
       EXCEPT SELECT pg_catalog.to_jsonb(o) - 'updated_at'::text FROM old_rows AS o)
      UNION ALL
      (SELECT pg_catalog.to_jsonb(o) - 'updated_at'::text FROM old_rows AS o
       EXCEPT SELECT pg_catalog.to_jsonb(n) - 'updated_at'::text FROM new_rows AS n)
    ) AS c
    WHERE c.j ->> 'created_by' IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

-- TRUNCATE は行が分からないので全員ぶん
CREATE OR REPLACE FUNCTION public.user_snapshot_log_all()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_snapshot_change (auth_uid, app_user_id, visit_id) VALUES (NULL, NULL, NULL);
  RETURN NULL;
END;
$$;

-- 公開条件を変えるビュー・関数のマイグレーションの最後で呼ぶ（全員の JSON を失効させる）
CREATE OR REPLACE FUNCTION public.invalidate_all_user_snapshots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.user_snapshot_change (auth_uid, app_user_id, visit_id) VALUES (NULL, NULL, NULL);
$$;

-- トリガ関数・失効関数はだれにも EXECUTE を渡さない（トリガの発火時は EXECUTE を検査しない。
-- Supabase は新しい関数に anon / authenticated の EXECUTE を自動で付けるので明示的に剥がす）
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.user_snapshot_log_visit()',
    'public.user_snapshot_log_photo()',
    'public.user_snapshot_log_app_user()',
    'public.user_snapshot_log_design_manhole()',
    'public.user_snapshot_log_all()',
    'public.invalidate_all_user_snapshots()'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. トリガ（遷移表は1トリガ1イベントなので、表ごとに INSERT / UPDATE / DELETE の3本＋TRUNCATE）
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['visit', 'photo', 'app_user', 'design_manhole'] LOOP
    EXECUTE format(
      'CREATE TRIGGER user_snapshot_log_ins AFTER INSERT ON public.%I'
      ' REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.user_snapshot_log_%s()', t, t);
    EXECUTE format(
      'CREATE TRIGGER user_snapshot_log_upd AFTER UPDATE ON public.%I'
      ' REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.user_snapshot_log_%s()', t, t);
    EXECUTE format(
      'CREATE TRIGGER user_snapshot_log_del AFTER DELETE ON public.%I'
      ' REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.user_snapshot_log_%s()', t, t);
    EXECUTE format(
      'CREATE TRIGGER user_snapshot_log_trunc AFTER TRUNCATE ON public.%I'
      ' FOR EACH STATEMENT EXECUTE FUNCTION public.user_snapshot_log_all()', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. 読み取り（公開ID で引く。auth_uid は返さない）
-- ---------------------------------------------------------------------------

-- 公開ID の版。"<a>.<b>.<c>":
--   a = その人の auth_uid の記録＋全員ぶんの記録
--   b = その公開ID（app_user.id）の記録
--   c = その時点でその人が持っている visit の記録（photo の変更）
-- 公開データに効くコミットがあれば組のどれかが必ず増える（c が減るのは visit の付け替え・削除のときだけで、
-- そのとき a も増える）。公開ID が無ければ NULL（404）。
CREATE OR REPLACE FUNCTION public.user_snapshot_rev_of(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      COALESCE((SELECT sum(c.weight) FROM public.user_snapshot_change AS c WHERE c.auth_uid = au.auth_uid), 0)
      + COALESCE((SELECT sum(c.weight) FROM public.user_snapshot_change AS c
                   WHERE c.auth_uid IS NULL AND c.app_user_id IS NULL AND c.visit_id IS NULL), 0)
    )::text
    || '.' || COALESCE((SELECT sum(c.weight) FROM public.user_snapshot_change AS c WHERE c.app_user_id = au.id), 0)::text
    || '.' || COALESCE((SELECT sum(c.weight)
                          FROM public.visit AS v
                          JOIN public.user_snapshot_change AS c ON c.visit_id = v.id
                         WHERE v.user_id = au.auth_uid), 0)::text
  FROM public.app_user AS au
  WHERE au.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_snapshot_rev(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.user_snapshot_rev_of(p_user_id);
$$;

-- スナップショット全体を1つの文で返す。STABLE 関数の中は呼び出し元の文と同じスナップショットで読むので、
-- rev とデータが同じ時点にそろう。中は既存の公開面（public_user_visit_base / _card、get_public_* 関数）だけを
-- 使い、公開条件を複製しない。公開ID が無ければ NULL。
CREATE OR REPLACE FUNCTION public.get_public_user_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'rev', public.user_snapshot_rev_of(p_user_id),
    'profile', (SELECT pg_catalog.to_jsonb(p) FROM public.get_public_profile(p_user_id) AS p LIMIT 1),
    'avatarPhotoId', public.get_public_avatar_photo_id(p_user_id),
    'cards', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) - 'ord'::text ORDER BY c.ord)
      FROM (
        SELECT pg_catalog.row_number() OVER (ORDER BY k.shot_at DESC, k.id) AS ord,
               k.id, k.manhole_id, k.shot_at, k.comment, k.created_at,
               k.manhole_title, k.manhole_prefecture, k.manhole_municipality, k.manhole_pokemons,
               k.latest_photo_id, k.latest_photo_is_landscape, k.latest_photo_ai_tags
        FROM public.public_user_visit_card AS k
        WHERE k.public_user_id = p_user_id
        ORDER BY k.shot_at DESC, k.id
        LIMIT 500
      ) AS c
    ), '[]'::jsonb),
    'progressRows', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'manhole_id', k.manhole_id, 'shot_at', k.shot_at, 'created_at', k.created_at,
               'manhole_prefecture', k.manhole_prefecture, 'latest_photo_id', k.latest_photo_id,
               'latest_photo_created_at', k.latest_photo_created_at,
               'latest_photo_is_landscape', k.latest_photo_is_landscape) ORDER BY k.id)
      FROM public.public_user_visit_card AS k
      WHERE k.public_user_id = p_user_id AND k.manhole_id IS NOT NULL
    ), '[]'::jsonb),
    'stats', (
      SELECT pg_catalog.jsonb_build_object(
        'totalVisits', pg_catalog.count(*),
        'prefectureCount', pg_catalog.count(DISTINCT b.manhole_prefecture) FILTER (WHERE b.manhole_prefecture <> ''))
      FROM public.public_user_visit_base AS b
      WHERE b.public_user_id = p_user_id
    ),
    'counts', pg_catalog.jsonb_build_object(
      'designManhole', public.get_public_design_manhole_count(p_user_id),
      'plush', public.get_public_plush_visit_count(p_user_id),
      'snow', public.get_public_snow_visit_count(p_user_id))
  )
  FROM public.app_user AS au
  WHERE au.id = p_user_id;
$$;

ALTER FUNCTION public.user_snapshot_rev_of(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_public_snapshot_rev(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_public_user_snapshot(uuid) OWNER TO postgres;
-- 中の合計関数は直接呼ばせない
REVOKE ALL ON FUNCTION public.user_snapshot_rev_of(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_snapshot_rev(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_user_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_snapshot_rev(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_user_snapshot(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_snapshot_rev(uuid) IS
  '公開スタンプ帳スナップショットの版（失効判定用の不透明な文字列）。公開ID が無ければ NULL。auth_uid は返さない（PR #501）。';
COMMENT ON FUNCTION public.get_public_user_snapshot(uuid) IS
  '公開スタンプ帳のスナップショット（版・プロフィール・アイコン・カード500件・県別用の全行・集計・件数）を1つの文で返す。'
  ' 中身は既存の公開面だけ。公開ID が無ければ NULL（PR #501）。';
