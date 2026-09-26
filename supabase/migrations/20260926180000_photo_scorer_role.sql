-- ---------------------------------------------------------------------------
-- k11 の自動採点ジョブ専用のロール photo_scorer
--
-- 新着写真を k11（manhole-score）で採点し、photo.quality_* に書き戻す。
-- 仕様: vault inbox/dev/pokefuta/spec/2026-09-26 pokefuta 新着写真の自動採点フロー.md
-- 検査: npm run verify:photo-scorer（tools/verify-photo-scorer.sql）
--
-- 何ができて、何ができないか（パスワードが漏れたときの被害の上限）:
--   * テーブル・ビュー・列への権限は1つも無い。photo も visit も直接は読み書きできない
--   * 書けるのは scoring.apply_photo_scores 経由の photo.quality_* 4列だけで、
--     版は scoring.active_version() が返す1つに限る（古い版のジョブは止まる）
--   * 読めるのは scoring.unscored_photos が返す id / storage_key / manhole_id / created_at /
--     採点の版と時刻だけ（非公開の写真を含む。exif や visit は返さない）
--   * PostgreSQL の既定で PUBLIC に開いているもの（public スキーマの USAGE、PUBLIC に
--     EXECUTE がある関数、pg_catalog）はログインロールなら誰でも持つ。そこで
--     scoring.audit_photo_scorer() が「届く表が無い」「呼べる SECURITY DEFINER 関数が
--     許可リストどおり」などを点検し、**k11 のジョブは書き込みの前に毎回これを呼んで、
--     違反が1件でもあれば書かずに止まる**（本番で誰かが権限を足しても、pg_net を
--     有効にしても、次の実行で止まる）。ローカルでは verify:photo-scorer が同じ関数を使う
--   * statement_timeout・接続数の上限は事故よけであって境界ではない（本人が変えられる）
--
-- テーブルに列単位で GRANT しない理由: photo の RLS ポリシーは全部 TO public で、
-- 中で visit と auth.uid() を参照している。専用ロールで photo を直接読み書きさせると
-- それらが評価され、visit への権限まで要る。関数（SECURITY DEFINER、所有者はこの
-- マイグレーションを流すロール＝postgres）に閉じ込めれば、ロール側は引数と戻り値しか扱えない。
--
-- スキーマを public にしないのは、public の関数は PostgREST の /rpc に出るため。
-- scoring は API の公開スキーマ（config.toml の api.schemas）に含めない。
--
-- パスワードはここに書かない。本番では SQL Editor で1回だけ
--   ALTER ROLE photo_scorer WITH PASSWORD '...';
-- を流し、k11 の ~/.config/pokefuta-scorer/env（600）に置く。.env.local には置かない。
-- パスワード未設定のあいだは誰もログインできない。
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ロール
--
-- 既にある場合は黙って使わない。強い権限を持った同名ロールを温存したまま関数の権限を
-- 足すと、「スコアしか書けない」が崩れる。既存を許すのは、ローカルの supabase db reset で
-- ロール（クラスタ単位）が残るため。そのときは:
--   * 属性・所属（photo_scorer が他ロールのメンバー）・メンバー（他ロールが photo_scorer に
--     SET ROLE できる）・所有物を検査し、想定と違えば失敗させる
--   * パスワードを消し、ロール単位の設定をリセットする（既知のパスワードを持つ同名ロールに
--     権限を足さない。本番では初回適用なのでこの分岐に入らない）
-- メンバーで許すのは、ロールを作ったユーザー自身の ADMIN のみの付与（PostgreSQL 16 以降、
-- CREATE ROLE で自動的に付く。SET も INHERIT も無いので photo_scorer にはなれない）。
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r pg_roles%ROWTYPE;
  existed boolean;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'photo_scorer';
  existed := FOUND;
  IF NOT existed THEN
    CREATE ROLE photo_scorer
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION
      CONNECTION LIMIT 2;
  ELSIF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
        OR NOT r.rolcanlogin OR r.rolinherit THEN
    RAISE EXCEPTION 'photo_scorer が既にあり、属性が想定と違う（super=%, createrole=%, createdb=%, bypassrls=%, replication=%, login=%, inherit=%）',
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication, r.rolcanlogin, r.rolinherit;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'photo_scorer'::regrole) THEN
    RAISE EXCEPTION 'photo_scorer が他のロールのメンバーになっている。権限を引き継ぐので外すこと';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = 'photo_scorer'::regrole
      AND (member <> (SELECT oid FROM pg_roles WHERE rolname = current_user) OR set_option OR inherit_option)
  ) THEN
    RAISE EXCEPTION 'photo_scorer に SET ROLE / 継承できるロールがある（pg_auth_members.roleid = photo_scorer）';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_shdepend
    WHERE refclassid = 'pg_authid'::regclass AND refobjid = 'photo_scorer'::regrole AND deptype = 'o'
  ) THEN
    RAISE EXCEPTION 'photo_scorer が所有しているオブジェクトがある';
  END IF;

  IF existed THEN
    ALTER ROLE photo_scorer PASSWORD NULL;
    ALTER ROLE photo_scorer RESET ALL;
  END IF;
END $$;

ALTER ROLE photo_scorer CONNECTION LIMIT 2;
ALTER ROLE photo_scorer SET statement_timeout = '120s';

COMMENT ON ROLE photo_scorer IS
  'k11 manhole-score の自動採点ジョブ専用。テーブル権限なし。scoring.unscored_photos / scoring.apply_photo_scores の EXECUTE のみ';

-- ---------------------------------------------------------------------------
-- スキーマ
--
-- 既にある場合は所有者を検査する。別の用途・別の所有者の scoring を黙って採用しない。
--
-- **scoring に関数を足すときは、必ず REVOKE ALL ... FROM PUBLIC を書くこと。**
-- PostgreSQL は新しい関数に PUBLIC の EXECUTE を付け、photo_scorer は scoring の USAGE を
-- 持つので、書き忘れると photo_scorer から呼べる。ALTER DEFAULT PRIVILEGES ... IN SCHEMA
-- での REVOKE は全体の既定を打ち消せない（スキーマ単位の既定は足す方向にしか効かない）ので
-- 使えず、全体の既定を変えると public など他のスキーマに響く。
-- SECURITY DEFINER の関数を書き忘れた場合は verify:photo-scorer の [3] が検出する。
-- SECURITY INVOKER の関数は呼んだ側の権限で動くので、テーブル権限の無い photo_scorer からは何もできない。
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT nspowner::regrole::text INTO owner_name FROM pg_namespace WHERE nspname = 'scoring';
  IF NOT FOUND THEN
    CREATE SCHEMA scoring;
  ELSIF owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'scoring スキーマが既にあり、所有者が % （想定は postgres）', owner_name;
  ELSIF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'scoring'::regnamespace)
     OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'scoring'::regnamespace
                AND proname NOT IN ('active_version', 'unscored_photos', 'apply_photo_scores', 'audit_photo_scorer'))
     OR EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'scoring'::regnamespace) THEN
    RAISE EXCEPTION 'scoring スキーマが既にあり、このマイグレーションの関数以外のものが入っている';
  END IF;
END $$;

-- 所有者は postgres に固定する（SECURITY DEFINER 関数の権限の基準になる。既存の
-- 20260923090000_site_counts_public_photo_coverage.sql と同じく明示する）
ALTER SCHEMA scoring OWNER TO postgres;
REVOKE ALL ON SCHEMA scoring FROM PUBLIC;
GRANT USAGE ON SCHEMA scoring TO photo_scorer;

-- ---------------------------------------------------------------------------
-- 有効な採点の版（1つだけ）
--
-- unscored_photos / apply_photo_scores は、この版以外で呼ばれたら例外にする。
-- 楽観ロックは「読んだ後の変更」しか防げない。版の切り替え時に古い版のジョブが
-- 残っていると、新しい版で採点済みの行を「自分の版では未採点」として読み、正当な
-- 期待値付きで古い版に戻せてしまい、新旧のジョブが交互に書き戻し合う
-- （PR #274 の Codex レビュー P1）。有効な版を1つに絞れば、古い版のジョブは
-- 読むことも書くこともできずに止まる。
--
-- 版を切り替えるときは、この関数を CREATE OR REPLACE するマイグレーションを足す。
-- STABLE にしてある（IMMUTABLE だと呼び出し側のキャッシュ済みの計画に定数として
-- 焼き付き、切り替え後も古い版が返りうる）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.active_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT 'quality_score/0.2.0'::text
$$;

-- ---------------------------------------------------------------------------
-- 採点の対象: 指定の版で採点されていない写真（未採点・旧版）
-- 非公開の写真も含める（公開に切り替えた瞬間から正しく並ぶように）。
-- storage_key は R2 から原本を取るために返す。exif や visit の情報は返さない。
-- quality_score_version / quality_scored_at は書き戻すときの楽観ロックの鍵
-- （apply_photo_scores の expected_version / expected_scored_at）。
-- 並びは新しい順。created_at が NULL の行は最後、同時刻は id で決める（毎回同じ順）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.unscored_photos(p_version text, p_limit integer DEFAULT 1000)
RETURNS TABLE (id uuid, storage_key text, manhole_id integer, created_at timestamptz,
               quality_score_version text, quality_scored_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_version IS NULL OR length(p_version) > 64
     OR p_version !~ '^[a-z_]+/[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'unscored_photos: 版の形が不正: %', left(p_version, 80);
  END IF;
  IF p_version IS DISTINCT FROM scoring.active_version() THEN
    RAISE EXCEPTION 'unscored_photos: % は有効な版ではない（有効な版は %）', p_version, scoring.active_version();
  END IF;

  RETURN QUERY
  SELECT p.id, p.storage_key, p.manhole_id, p.created_at, p.quality_score_version, p.quality_scored_at
  FROM public.photo AS p
  WHERE p.quality_score_version IS DISTINCT FROM p_version
  ORDER BY p.created_at DESC NULLS LAST, p.id DESC
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
END;
$$;

-- ---------------------------------------------------------------------------
-- 採点結果の書き込み
--
-- p_rows: [{"id": "<uuid>", "score": 0.83, "eligible": true,
--           "expected_version": <unscored_photos が返した quality_score_version | null>,
--           "expected_scored_at": <unscored_photos が返した quality_scored_at | null>}, ...]
--
-- 入力は JSON の型から厳密に検査する。jsonb_to_recordset は "0.5" や "true" のような
-- 文字列も黙って変換するので、変換の前に各キーの jsonb_typeof を見る。知らないキーも拒否。
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
--
-- photo_protect_quality_score トリガは anon / authenticated だけを止めるので、
-- 所有者として動くこの関数は通る。
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
  -- 5000 行 × 1行 200 バイト前後で 1MB。桁違いに大きいものは中身を見る前に断る
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
        OR EXISTS (
          SELECT 1 FROM jsonb_object_keys(e) AS k
          WHERE k NOT IN ('id', 'score', 'eligible', 'expected_version', 'expected_scored_at')
        )
    END
  ) THEN
    RAISE EXCEPTION 'apply_photo_scores: 行の形が不正（id=文字列, score=数, eligible=真偽, expected_version / expected_scored_at=文字列か null。ほかのキーは不可）';
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

-- ---------------------------------------------------------------------------
-- 権限の自己点検
--
-- photo_scorer は本番に直接ログインするので、PostgreSQL が PUBLIC に開いているもの
-- （public スキーマ、PUBLIC に EXECUTE がある関数、有効にした拡張の表）を全部持つ。
-- マイグレーション時点の検査だけでは、あとから誰かが権限を足したり拡張を有効にしたり
-- したときに気づけない。そこで違反を返す関数を置き、k11 のジョブが**書き込みの前に毎回**
-- 呼んで、1件でも返ってきたら書かずに止まる。ローカルの verify:photo-scorer も同じ関数を使う。
--
-- 返す違反（1行 = 1件、kind と detail）:
--   role_attribute     … superuser / createrole / createdb / bypassrls / replication / inherit / 接続数
--   member_of          … photo_scorer が他ロールのメンバー（権限を引き継ぐ）
--   can_become         … 他ロールが photo_scorer に SET ROLE / 継承できる
--   reachable_relation … スキーマの USAGE があり、表か列の権限もある（＝届く表）
--   secdef_function    … 呼べる SECURITY DEFINER 関数のうち、下の許可リストに無いもの
--   scoring_object     … scoring にこのマイグレーション以外のものがある
--   extension          … pg_net が有効（net の表が PUBLIC に開き、DB から HTTP を出せる）
--
-- 許可リストの public の3関数は、2026-09-26 時点で本番でもローカルでも PUBLIC が呼べる
-- SECURITY DEFINER 関数のすべて（どれも anon が /rpc で既に呼べる）。public に
-- SECURITY DEFINER 関数を足して REVOKE を書き忘れると、ここに引っかかってジョブが止まる。
-- その関数を photo_scorer に呼ばせてよいなら許可リストに足し、だめなら REVOKE を書く。
--
-- SECURITY INVOKER にしてある（呼んだ側の権限で pg_catalog を読むだけ。権限を上げない）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.audit_photo_scorer()
RETURNS TABLE (kind text, detail text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 'role_attribute', format(
      'super=%s createrole=%s createdb=%s bypassrls=%s replication=%s login=%s inherit=%s connlimit=%s',
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication,
      r.rolcanlogin, r.rolinherit, r.rolconnlimit)
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'photo_scorer'
    AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
         OR NOT r.rolcanlogin OR r.rolinherit OR r.rolconnlimit <> 2)

  UNION ALL
  SELECT 'member_of', m.roleid::pg_catalog.regrole::text
  FROM pg_catalog.pg_auth_members AS m
  WHERE m.member = 'photo_scorer'::pg_catalog.regrole

  UNION ALL
  SELECT 'can_become', m.member::pg_catalog.regrole::text
  FROM pg_catalog.pg_auth_members AS m
  WHERE m.roleid = 'photo_scorer'::pg_catalog.regrole
    AND (m.set_option OR m.inherit_option)

  UNION ALL
  SELECT 'reachable_relation', ns.nspname || '.' || c.relname
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'v', 'm', 'p', 'f')
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    AND pg_catalog.has_schema_privilege('photo_scorer', ns.oid, 'USAGE')
    AND (pg_catalog.has_table_privilege('photo_scorer', c.oid,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         OR pg_catalog.has_any_column_privilege('photo_scorer', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))

  UNION ALL
  SELECT 'secdef_function', f.sig
  FROM (
    SELECT ns.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS sig
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
    WHERE p.prosecdef
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND pg_catalog.has_schema_privilege('photo_scorer', ns.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('photo_scorer', p.oid, 'EXECUTE')
  ) AS f
  WHERE f.sig NOT IN (
    'scoring.unscored_photos(text, integer)',
    'scoring.apply_photo_scores(text, timestamp with time zone, jsonb)',
    'public.get_my_app_user_id()',
    'public.get_site_stats()',
    'public.is_own_manhole_comment(uuid)'
  )

  UNION ALL
  SELECT 'scoring_object', 'relation ' || c.relname
  FROM pg_catalog.pg_class AS c
  WHERE c.relnamespace = 'scoring'::pg_catalog.regnamespace
  UNION ALL
  SELECT 'scoring_object', 'function ' || p.proname
  FROM pg_catalog.pg_proc AS p
  WHERE p.pronamespace = 'scoring'::pg_catalog.regnamespace
    AND p.proname NOT IN ('active_version', 'unscored_photos', 'apply_photo_scores', 'audit_photo_scorer')

  UNION ALL
  SELECT 'extension', 'pg_net ' || e.extversion
  FROM pg_catalog.pg_extension AS e
  WHERE e.extname = 'pg_net'
$$;

-- scoring には Supabase の既定の権限（public / storage 等にはある anon への EXECUTE）が
-- 掛かっていないが、将来の設定変更に備えて名指しでも外す。
ALTER FUNCTION scoring.active_version() OWNER TO postgres;
ALTER FUNCTION scoring.unscored_photos(text, integer) OWNER TO postgres;
ALTER FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) OWNER TO postgres;
ALTER FUNCTION scoring.audit_photo_scorer() OWNER TO postgres;

-- active_version は SECURITY DEFINER の2関数の中から所有者として呼ぶだけなので、誰にも GRANT しない
REVOKE ALL ON FUNCTION scoring.active_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION scoring.unscored_photos(text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION scoring.audit_photo_scorer() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION scoring.unscored_photos(text, integer) TO photo_scorer;
GRANT EXECUTE ON FUNCTION scoring.apply_photo_scores(text, timestamptz, jsonb) TO photo_scorer;
GRANT EXECUTE ON FUNCTION scoring.audit_photo_scorer() TO photo_scorer;
