-- ---------------------------------------------------------------------------
-- 横・逆さで保存された投稿写真を 90° 刻みで直す: k11 の写真の向きジョブ専用ロール photo_rotator
--
-- 背景（2026-11-04）: iPhone を真下に向けてマンホールを撮ると、どちらが上か決められずに
-- 写真が横・逆さで保存される。k11 の manhole-ai Tools/pokefuta-id/orient.py が、同じ蓋のほかの
-- 写真に回して合わせて角度を出す（人の判定 101 枚で、ずれ 8° 以内・確からしさ 0.7 以上は 61 枚中 60 枚一致）。
-- 直すと決めた写真（人が「右で直す」にしたもの、または上の線を越えた 90°・270°）を、
-- k11 が回した元写真とサムネイルを R2 に**新しいキー**で置いた後、ここの関数で photo の行を差し替える。
--
-- 新しいキーにする理由:
--   * R2 の写真は immutable で1年キャッシュされる。同じキーで中身を変えると古い向きが残る
--   * 古い写真を残しておけば、差し替えを戻すだけで元に戻せる（下の「戻し方」）
--   * 置き直しの途中で失敗しても、DB が差し替わるまでは古い写真のまま表示がずれない
-- 古い R2 のオブジェクトは、/api/photo/[id] の 307 の CDN キャッシュ（1日）と署名URL（2日）が切れてから
-- 運営が手で消す（k11 の R2 ミラーは削除を写さないので元写真は残る）。
--
-- 差し替えで変えるもの:
--   * storage_key・file_size・sha256・content_type（回した元写真のもの）
--   * width / height（90°・270° は入れ替え）
--   * quality_score_version / quality_scored_at を空にする → 翌朝の自動採点（photo_scorer）が
--     回した写真で採点し直す（scoring.unscored_photos は版の違う行を返す）
--   * ai_tags の crop / lid / lid_fits / plush_box（回す前の写真の座標）を外す。採点し直すまでの間に
--     古い座標で切り抜かないため。外した写真は真ん中で切る（photo-ai-tags.ts）
--
-- 戻し方: 同じ関数を古いキーと新しいキーを入れ替え、turn を 360 - turn にして呼ぶ。
--
-- 何が誰に開いているか: photo_scorer と同じ作り（20260927100000_photo_scorer_role.sql）。
--   * photo_rotator はテーブル権限を持たず、rotation_ops の関数の EXECUTE だけ
--   * rotation_ops は PostgREST の api.schemas に含めない
--   * k11 のジョブは書き込みの前に毎回 rotation_ops.audit_photo_rotator() を呼び、違反があれば止まる
--   * 暴走しても被害を限るため、24 時間で 300 枚を超える差し替えは関数が拒否する
--
-- パスワードはここに書かない。本番では SQL Editor で1回だけ
--   ALTER ROLE photo_rotator WITH PASSWORD '...';
-- を流し、k11 の ~/.config/pokefuta-rotator/env（600）に置く。リポジトリにも .env.local にも置かない。
--
-- 検査: npm run verify:photo-rotator（tools/verify-photo-rotator.sql）
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ロール（photo_scorer と同じ検査。既存の同名ロールに強い権限があれば失敗させる）
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r pg_roles%ROWTYPE;
  existed boolean;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'photo_rotator';
  existed := FOUND;
  IF NOT existed THEN
    CREATE ROLE photo_rotator
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION
      CONNECTION LIMIT 2;
  ELSIF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
        OR NOT r.rolcanlogin OR r.rolinherit THEN
    RAISE EXCEPTION 'photo_rotator が既にあり、属性が想定と違う';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'photo_rotator'::regrole) THEN
    RAISE EXCEPTION 'photo_rotator が他のロールのメンバーになっている';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = 'photo_rotator'::regrole
      AND (member <> (SELECT oid FROM pg_roles WHERE rolname = current_user) OR set_option OR inherit_option)
  ) THEN
    RAISE EXCEPTION 'photo_rotator に SET ROLE / 継承できるロールがある';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_shdepend
    WHERE refclassid = 'pg_authid'::regclass AND refobjid = 'photo_rotator'::regrole AND deptype = 'o'
  ) THEN
    RAISE EXCEPTION 'photo_rotator が所有しているオブジェクトがある';
  END IF;

  IF existed THEN
    ALTER ROLE photo_rotator PASSWORD NULL;
    ALTER ROLE photo_rotator RESET ALL;
  END IF;
END $$;

ALTER ROLE photo_rotator CONNECTION LIMIT 2;
ALTER ROLE photo_rotator SET statement_timeout = '60s';

COMMENT ON ROLE photo_rotator IS
  '投稿写真の向きを 90° 刻みで直す k11 のジョブ専用。テーブル権限なし。rotation_ops の関数の EXECUTE のみ';

-- ---------------------------------------------------------------------------
-- スキーマ rotation_ops（PostgREST の api.schemas に含めない）
-- **ここに関数を足すときは必ず REVOKE ALL ... FROM PUBLIC を書き、audit の許可リストに足すこと。**
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT nspowner::regrole::text INTO owner_name FROM pg_namespace WHERE nspname = 'rotation_ops';
  IF NOT FOUND THEN
    CREATE SCHEMA rotation_ops;
  ELSIF owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'rotation_ops スキーマが既にあり、所有者が %', owner_name;
  END IF;
END $$;

ALTER SCHEMA rotation_ops OWNER TO postgres;
REVOKE ALL ON SCHEMA rotation_ops FROM PUBLIC;
GRANT USAGE ON SCHEMA rotation_ops TO photo_rotator;

-- 差し替えの記録（戻すときに古いキーを引く。1日あたりの上限もここで数える）
CREATE TABLE rotation_ops.operation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  photo_id uuid NOT NULL,
  old_key text NOT NULL,
  new_key text NOT NULL,
  turn integer NOT NULL,
  source text NOT NULL,
  actor text NOT NULL DEFAULT session_user,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rotation_log_created ON rotation_ops.operation_log (created_at);
REVOKE ALL ON rotation_ops.operation_log FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 差し替え
--   p_turn   … 時計回りに何度回したか（90・180・270）
--   p_source … 'human'（人が「右で直す」にした）| 'auto'（orient.py の線を越えた）| 'revert'（戻す）
-- 古いキーが今の storage_key と一致しなければ何もしない（楽観ロック。別の経路で変わっていたら書かない）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rotation_ops.apply_rotation(
  p_photo_id uuid, p_old_key text, p_new_key text, p_turn integer,
  p_file_size integer, p_sha256 text, p_source text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  IF p_photo_id IS NULL OR p_old_key IS NULL THEN
    RAISE EXCEPTION 'apply_rotation: photo_id と古いキーは必須';
  END IF;
  IF p_turn IS NULL OR p_turn NOT IN (90, 180, 270) THEN
    RAISE EXCEPTION 'apply_rotation: turn は 90・180・270 のどれか: %', p_turn;
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('human', 'auto', 'revert') THEN
    RAISE EXCEPTION 'apply_rotation: source が不正: %', left(p_source, 40);
  END IF;
  -- アプリの generateStorageKey と同じ形（deriveSmallKey がサムネイルのキーを出せる形）だけ受ける
  IF p_new_key IS NULL OR p_new_key !~ '^photos/original/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.jpg$' THEN
    RAISE EXCEPTION 'apply_rotation: 新しいキーの形が不正: %', left(p_new_key, 120);
  END IF;
  IF p_new_key = p_old_key THEN
    RAISE EXCEPTION 'apply_rotation: 新しいキーが古いキーと同じ';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 50 * 1024 * 1024 THEN
    RAISE EXCEPTION 'apply_rotation: file_size が範囲外: %', p_file_size;
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'apply_rotation: sha256 の形が不正';
  END IF;
  IF EXISTS (SELECT 1 FROM public.photo WHERE storage_key = p_new_key) THEN
    RAISE EXCEPTION 'apply_rotation: 新しいキーは既にほかの写真が使っている';
  END IF;
  IF (SELECT count(*) FROM rotation_ops.operation_log WHERE created_at > now() - interval '24 hours') >= 300 THEN
    RAISE EXCEPTION 'apply_rotation: 24 時間の上限（300 枚）に達した';
  END IF;

  UPDATE public.photo AS p
  SET storage_key = p_new_key,
      file_size = p_file_size,
      sha256 = p_sha256,
      content_type = 'image/jpeg',
      width = CASE WHEN p_turn IN (90, 270) THEN p.height ELSE p.width END,
      height = CASE WHEN p_turn IN (90, 270) THEN p.width ELSE p.height END,
      quality_score_version = NULL,
      quality_scored_at = NULL,
      ai_tags = CASE WHEN p.ai_tags IS NULL THEN NULL
                     ELSE p.ai_tags - 'crop' - 'lid' - 'lid_fits' - 'plush_box' END
  WHERE p.id = p_photo_id AND p.storage_key = p_old_key;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RETURN false;
  END IF;

  INSERT INTO rotation_ops.operation_log (photo_id, old_key, new_key, turn, source)
  VALUES (p_photo_id, p_old_key, p_new_key, p_turn, p_source);
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 権限の自己点検（scoring.audit_photo_scorer と同じ考え方。k11 のジョブは書き込みの前に毎回呼び、違反があれば止まる）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rotation_ops.audit_photo_rotator()
RETURNS TABLE (kind text, detail text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'role_attribute', format('super=%s createrole=%s createdb=%s bypassrls=%s replication=%s login=%s inherit=%s connlimit=%s',
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication, r.rolcanlogin, r.rolinherit, r.rolconnlimit)
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'photo_rotator'
    AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
         OR NOT r.rolcanlogin OR r.rolinherit OR r.rolconnlimit <> 2)

  UNION ALL
  SELECT 'member_of', m.roleid::pg_catalog.regrole::text
  FROM pg_catalog.pg_auth_members AS m
  WHERE m.member = 'photo_rotator'::pg_catalog.regrole

  UNION ALL
  SELECT 'can_become', m.member::pg_catalog.regrole::text
  FROM pg_catalog.pg_auth_members AS m
  WHERE m.roleid = 'photo_rotator'::pg_catalog.regrole AND (m.set_option OR m.inherit_option)

  UNION ALL
  SELECT 'reachable_relation', ns.nspname || '.' || c.relname
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'v', 'm', 'p', 'f')
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    AND pg_catalog.has_schema_privilege('photo_rotator', ns.oid, 'USAGE')
    AND (pg_catalog.has_table_privilege('photo_rotator', c.oid,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
         OR pg_catalog.has_any_column_privilege('photo_rotator', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))

  UNION ALL
  SELECT 'reachable_sequence', ns.nspname || '.' || c.relname
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
  WHERE c.relkind = 'S'
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    -- has_sequence_privilege はシーケンス以外に渡すと例外になり、WHERE の評価順は保証されないので CASE で先に relkind を見る
    AND CASE WHEN c.relkind = 'S'
             THEN pg_catalog.has_sequence_privilege('photo_rotator', c.oid, 'USAGE, SELECT, UPDATE')
             ELSE false END

  UNION ALL
  SELECT 'database_create', pg_catalog.current_database()
  WHERE pg_catalog.has_database_privilege('photo_rotator', pg_catalog.current_database(), 'CREATE')

  UNION ALL
  SELECT 'schema_create', ns.nspname
  FROM pg_catalog.pg_namespace AS ns
  WHERE pg_catalog.has_schema_privilege('photo_rotator', ns.oid, 'CREATE')

  UNION ALL
  SELECT 'secdef_function', f.sig
  FROM (
    SELECT ns.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS sig
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
    WHERE p.prosecdef
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND pg_catalog.has_schema_privilege('photo_rotator', ns.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('photo_rotator', p.oid, 'EXECUTE')
  ) AS f
  WHERE f.sig NOT IN (
    'rotation_ops.apply_rotation(uuid, text, text, integer, integer, text, text)'
  )

  UNION ALL
  SELECT 'ops_object', 'function ' || f.sig
  FROM (
    SELECT p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS sig
    FROM pg_catalog.pg_proc AS p
    WHERE p.pronamespace = 'rotation_ops'::pg_catalog.regnamespace
  ) AS f
  WHERE f.sig NOT IN (
    'apply_rotation(uuid, text, text, integer, integer, text, text)', 'audit_photo_rotator()'
  )

  UNION ALL
  SELECT 'function_attribute', format('%s owner=%s secdef=%s config=%s', p.proname,
           pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef,
           coalesce(pg_catalog.array_to_string(p.proconfig, ','), 'NULL'))
  FROM pg_catalog.pg_proc AS p
  WHERE p.pronamespace = 'rotation_ops'::pg_catalog.regnamespace
    -- NULL になりうる proconfig（RESET search_path 後）も違反として拾うよう、NULL 安全に比べる
    AND (pg_catalog.pg_get_userbyid(p.proowner) IS DISTINCT FROM 'postgres'
         OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[]
         OR p.prosecdef IS DISTINCT FROM (p.proname = 'apply_rotation'))

  UNION ALL
  SELECT 'extension', 'pg_net ' || e.extversion
  FROM pg_catalog.pg_extension AS e
  WHERE e.extname = 'pg_net'
$$;

ALTER FUNCTION rotation_ops.apply_rotation(uuid, text, text, integer, integer, text, text) OWNER TO postgres;
ALTER FUNCTION rotation_ops.audit_photo_rotator() OWNER TO postgres;
REVOKE ALL ON FUNCTION rotation_ops.apply_rotation(uuid, text, text, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION rotation_ops.audit_photo_rotator() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rotation_ops.apply_rotation(uuid, text, text, integer, integer, text, text) TO photo_rotator;
GRANT EXECUTE ON FUNCTION rotation_ops.audit_photo_rotator() TO photo_rotator;
