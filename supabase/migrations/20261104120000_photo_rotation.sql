-- ---------------------------------------------------------------------------
-- 横・逆さで保存された投稿写真を 90° 刻みで直す: scoring.apply_photo_rotation（自動採点ロール photo_scorer から呼ぶ）
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
-- 古い R2 のオブジェクト（元写真とサムネイル）は、/api/photo/[id] の 307 の CDN キャッシュ（1日）と
-- 署名URL（2日）が切れた後、**差し替えから 3 日で k11 のジョブが消す**（ジョブは自分で置いたキーを手元に記録している）。
-- アプリの削除（DELETE /api/photo/[id]）は今のキーしか消さないので、差し替えた後に投稿者が写真を消しても、
-- 古いオブジェクトが残るのは差し替えから最長 3 日。署名URL の寿命（2日）と同じくらいで、それより長く残さない。
-- k11 の R2 ミラーは削除を写さないので、元写真は（ほかの削除済みの写真と同じく）バックアップにだけ残る。
--
-- 差し替えで変えるもの:
--   * storage_key・file_size・sha256・content_type（回した元写真のもの）
--   * width / height（90°・270° は入れ替え）
--   * quality_score_version を空にする → 翌朝の自動採点（photo_scorer）が回した写真で採点し直す
--     （scoring.unscored_photos は版の違う行を返す）。quality_scored_at は差し替えた時刻にする。
--     apply_photo_scores の楽観ロックは (expected_version, expected_scored_at) なので、差し替えの前に
--     回す前の写真を読んだ採点のバッチ（どちらも NULL を読んでいる）は書けなくなる
--   * ai_tags の crop / lid / lid_fits / plush_box（回す前の写真の座標）を外す。採点し直すまでの間に
--     古い座標で切り抜かないため。外した写真は真ん中で切る（photo-ai-tags.ts）
--
-- 戻し方: 同じ関数を古いキーと新しいキーを入れ替え、turn を 360 - turn、source を 'revert' にして呼ぶ。
-- file_size・sha256・content_type は差し替えの記録（photo_rotation.operation_log）に残した元の値に戻す（渡した値は使わない）。
--
-- 誰が呼ぶか: 新しいロールは作らず、k11 で既に動いている自動採点ロール photo_scorer に EXECUTE を足す
-- （パスワードと接続先を増やさないため）。合わせて scoring.audit_photo_scorer() の許可リストにこの関数を足す。
-- **同じマイグレーションで両方を変える**（関数だけ先に入ると、自己点検が違反として本番の自動採点を止める）。
--   * 暴走しても被害を限るため、24 時間で 300 枚を超える差し替えは関数が拒否する（戻すのは数えない）
--   * 差し替えの記録の表は scoring に置かない（scoring の表は自己点検が違反にする）。
--     photo_rotation スキーマに置き、photo_scorer には USAGE も与えない（関数の中から所有者として書くだけ）
--
-- 検査: npm run verify:photo-rotation（tools/verify-photo-rotation.sql）、npm run verify:photo-scorer
-- ---------------------------------------------------------------------------

-- 差し替えの記録（戻すときに元の値を引く。1日あたりの上限もここで数える）
DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT nspowner::regrole::text INTO owner_name FROM pg_namespace WHERE nspname = 'photo_rotation';
  IF NOT FOUND THEN
    CREATE SCHEMA photo_rotation;
  ELSIF owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'photo_rotation スキーマが既にあり、所有者が %', owner_name;
  END IF;
END $$;

ALTER SCHEMA photo_rotation OWNER TO postgres;
REVOKE ALL ON SCHEMA photo_rotation FROM PUBLIC;

CREATE TABLE photo_rotation.operation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  photo_id uuid NOT NULL,
  old_key text NOT NULL,
  new_key text NOT NULL,
  turn integer NOT NULL,
  source text NOT NULL,
  -- 差し替える前の値（戻すときにこれに戻す。投稿の content_type は file.type なので .jpg のキーでも HEIC などがある）
  old_file_size integer,
  old_sha256 text,
  old_content_type text,
  actor text NOT NULL DEFAULT session_user,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_photo_rotation_log_created ON photo_rotation.operation_log (created_at);
REVOKE ALL ON photo_rotation.operation_log FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 差し替え
--   p_turn   … 時計回りに何度回したか（90・180・270）
--   p_source … 'human'（人が「右で直す」にした）| 'auto'（orient.py の線を越えた）| 'revert'（戻す）
-- 古いキーが今の storage_key と一致しなければ何もしない（楽観ロック。別の経路で変わっていたら書かない）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.apply_photo_rotation(
  p_photo_id uuid, p_old_key text, p_new_key text, p_turn integer,
  p_file_size integer, p_sha256 text, p_source text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  cur record;
  v_size integer := p_file_size;
  v_sha text := p_sha256;
  v_type text := 'image/jpeg';
  v_turn integer;
BEGIN
  -- 呼び出しを1本ずつにする。下の「新しいキーが未使用か」「24 時間の上限」の確認と書き込みの間に
  -- 別の接続が割り込まないように（photo.storage_key に一意制約は無い）
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('scoring.apply_photo_rotation'));

  IF p_photo_id IS NULL OR p_old_key IS NULL THEN
    RAISE EXCEPTION 'apply_photo_rotation: photo_id と古いキーは必須';
  END IF;
  IF p_turn IS NULL OR p_turn NOT IN (90, 180, 270) THEN
    RAISE EXCEPTION 'apply_photo_rotation: turn は 90・180・270 のどれか: %', p_turn;
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('human', 'auto', 'revert') THEN
    RAISE EXCEPTION 'apply_photo_rotation: source が不正: %', left(p_source, 40);
  END IF;
  -- アプリの generateStorageKey と同じ形（deriveSmallKey がサムネイルのキーを出せる形）だけ受ける
  IF p_new_key IS NULL OR p_new_key !~ '^photos/original/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.jpg$' THEN
    RAISE EXCEPTION 'apply_photo_rotation: 新しいキーの形が不正: %', left(p_new_key, 120);
  END IF;
  IF p_new_key = p_old_key THEN
    RAISE EXCEPTION 'apply_photo_rotation: 新しいキーが古いキーと同じ';
  END IF;
  IF p_source = 'revert' THEN
    -- 戻すのは、このキーの組で差し替えた記録があるときだけ。値は記録の元の値
    SELECT l.old_file_size, l.old_sha256, l.old_content_type, l.turn INTO v_size, v_sha, v_type, v_turn
    FROM photo_rotation.operation_log AS l
    WHERE l.photo_id = p_photo_id AND l.new_key = p_old_key AND l.old_key = p_new_key AND l.source <> 'revert'
    ORDER BY l.id DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_photo_rotation: 戻す元の差し替えの記録が無い';
    END IF;
    IF p_turn <> 360 - v_turn THEN
      RAISE EXCEPTION 'apply_photo_rotation: 戻す角度は % のはず（記録は %）: %', 360 - v_turn, v_turn, p_turn;
    END IF;
  ELSE
    IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 50 * 1024 * 1024 THEN
      RAISE EXCEPTION 'apply_photo_rotation: file_size が範囲外: %', p_file_size;
    END IF;
    IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'apply_photo_rotation: sha256 の形が不正';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.photo WHERE storage_key = p_new_key) THEN
    RAISE EXCEPTION 'apply_photo_rotation: 新しいキーは既にほかの写真が使っている';
  END IF;
  -- 戻すのは上限に数えない（自動の回が上限まで間違えても、すぐ戻せるように）
  IF p_source <> 'revert' AND (SELECT count(*) FROM photo_rotation.operation_log
                               WHERE created_at > now() - interval '24 hours' AND source <> 'revert') >= 300 THEN
    RAISE EXCEPTION 'apply_photo_rotation: 24 時間の上限（300 枚）に達した';
  END IF;

  SELECT p.file_size, p.sha256, p.content_type INTO cur
  FROM public.photo AS p
  WHERE p.id = p_photo_id AND p.storage_key = p_old_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.photo AS p
  SET storage_key = p_new_key,
      file_size = v_size,
      sha256 = v_sha,
      content_type = v_type,
      width = CASE WHEN p_turn IN (90, 270) THEN p.height ELSE p.width END,
      height = CASE WHEN p_turn IN (90, 270) THEN p.width ELSE p.height END,
      quality_score_version = NULL,
      quality_scored_at = pg_catalog.clock_timestamp(),
      ai_tags = CASE WHEN p.ai_tags IS NULL THEN NULL
                     ELSE p.ai_tags - 'crop' - 'lid' - 'lid_fits' - 'plush_box' END
  WHERE p.id = p_photo_id AND p.storage_key = p_old_key;

  INSERT INTO photo_rotation.operation_log
    (photo_id, old_key, new_key, turn, source, old_file_size, old_sha256, old_content_type)
  VALUES (p_photo_id, p_old_key, p_new_key, p_turn, p_source, cur.file_size, cur.sha256, cur.content_type);
  RETURN true;
END;
$$;

ALTER FUNCTION scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text) TO photo_scorer;

-- ---------------------------------------------------------------------------
-- 自動採点の権限の自己点検に apply_photo_rotation を足す（20260927100000 の定義から許可リスト3か所だけ変える）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION scoring.audit_photo_scorer()
RETURNS TABLE (kind text, detail text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
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
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
         OR pg_catalog.has_any_column_privilege('photo_scorer', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))

  UNION ALL
  SELECT 'reachable_sequence', ns.nspname || '.' || c.relname
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
  WHERE c.relkind = 'S'
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    -- has_sequence_privilege はシーケンス以外に渡すと例外になり、WHERE の評価順は
    -- 保証されないので CASE で先に relkind を見る
    AND CASE WHEN c.relkind = 'S'
             THEN pg_catalog.has_sequence_privilege('photo_scorer', c.oid, 'USAGE, SELECT, UPDATE')
             ELSE false END

  UNION ALL
  SELECT 'database_create', pg_catalog.current_database()
  WHERE pg_catalog.has_database_privilege('photo_scorer', pg_catalog.current_database(), 'CREATE')

  UNION ALL
  SELECT 'schema_create', ns.nspname
  FROM pg_catalog.pg_namespace AS ns
  WHERE pg_catalog.has_schema_privilege('photo_scorer', ns.oid, 'CREATE')

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
    'scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text)'
  )

  UNION ALL
  SELECT 'scoring_object', 'relation ' || c.relname
  FROM pg_catalog.pg_class AS c
  WHERE c.relnamespace = 'scoring'::pg_catalog.regnamespace
  UNION ALL
  SELECT 'scoring_object', 'function ' || f.sig
  FROM (
    SELECT p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS sig
    FROM pg_catalog.pg_proc AS p
    WHERE p.pronamespace = 'scoring'::pg_catalog.regnamespace
  ) AS f
  WHERE f.sig NOT IN (
    'active_version()', 'unscored_photos(text, integer)',
    'apply_photo_scores(text, timestamp with time zone, jsonb)', 'audit_photo_scorer()',
    'apply_photo_rotation(uuid, text, text, integer, integer, text, text)'
  )

  UNION ALL
  SELECT 'function_attribute', format('%s owner=%s secdef=%s config=%s',
           p.proname, pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef,
           coalesce(pg_catalog.array_to_string(p.proconfig, ','), 'NULL'))
  FROM pg_catalog.pg_proc AS p
  WHERE p.pronamespace = 'scoring'::pg_catalog.regnamespace
    AND p.proname IN ('active_version', 'unscored_photos', 'apply_photo_scores', 'audit_photo_scorer',
                      'apply_photo_rotation')
    -- NULL になりうる proconfig（RESET search_path 後）も違反として拾うよう、NULL 安全に比べる
    AND (pg_catalog.pg_get_userbyid(p.proowner) IS DISTINCT FROM 'postgres'
         OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[]
         OR p.prosecdef IS DISTINCT FROM (p.proname IN ('unscored_photos', 'apply_photo_scores',
                                                        'apply_photo_rotation')))

  UNION ALL
  SELECT 'extension', 'pg_net ' || e.extversion
  FROM pg_catalog.pg_extension AS e
  WHERE e.extname = 'pg_net'
$$;


ALTER FUNCTION scoring.audit_photo_scorer() OWNER TO postgres;
REVOKE ALL ON FUNCTION scoring.audit_photo_scorer() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION scoring.audit_photo_scorer() TO photo_scorer;
