-- photo_rotator（k11 の写真の向きジョブ専用ロール）の権限と rotation_ops 関数の挙動を、
-- ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20261104120000_photo_rotator_role.sql
--
-- このロールの要は「関数を呼べる」ことより「それ以外は何もできない」こと。
-- 検証のために postgres へ一時的に photo_rotator の SET を付与する（SET ROLE のため）。
-- 単一の DO 文なので、途中で落ちればメンバーシップも検証行も巻き戻る。

DO $$
DECLARE
  bad text;
  was_member boolean;
  m bigint;
  pid uuid := '00000000-0000-0000-0000-0000000fd101';
  k_old text := 'photos/original/2026/11/00000000-0000-0000-0000-0000000fd101.jpg';
  k_new text := 'photos/original/2026/11/00000000-0000-0000-0000-0000000fd102.jpg';
  sha text := repeat('a', 64);
  ok boolean;
  row public.photo%ROWTYPE;
  f_apply regprocedure := 'rotation_ops.apply_rotation(uuid,text,text,integer,integer,text,text)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'photo_rotator') THEN
    RAISE EXCEPTION 'photo_rotator が無い。supabase db reset でマイグレーションを流すこと';
  END IF;

  -- ---------------------------------------------------------------------
  -- 1. 権限の自己点検が違反を返さない（ローカルの pg_net は警告。本番で出たらジョブが止まる）
  -- ---------------------------------------------------------------------
  SELECT string_agg(a.kind || ': ' || a.detail, ', ') INTO bad
  FROM rotation_ops.audit_photo_rotator() AS a
  WHERE NOT (a.kind IN ('reachable_relation', 'reachable_sequence') AND a.detail LIKE 'net.%')
    AND NOT (a.kind = 'extension' AND a.detail LIKE 'pg_net %');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[1] 権限の自己点検が違反を返した: %', bad;
  END IF;
  SELECT string_agg(a.detail, ', ') INTO bad FROM rotation_ops.audit_photo_rotator() AS a;
  IF bad IS NOT NULL THEN
    RAISE WARNING '[1] ローカルの pg_net により photo_rotator から届くもの（本番ならジョブが止まる）: %', bad;
  END IF;
  -- 自動採点の自己点検も、このマイグレーションで違反が増えていない
  SELECT string_agg(a.kind || ': ' || a.detail, ', ') INTO bad
  FROM scoring.audit_photo_scorer() AS a
  WHERE NOT (a.kind IN ('reachable_relation', 'reachable_sequence') AND a.detail LIKE 'net.%')
    AND NOT (a.kind = 'extension' AND a.detail LIKE 'pg_net %');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[1] scoring.audit_photo_scorer() が違反を返した（自動採点が止まる）: %', bad;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. 自己点検が効く（わざと違反を作って検出されるか）
  -- ---------------------------------------------------------------------
  GRANT SELECT ON public.photo TO photo_rotator;
  IF NOT EXISTS (SELECT 1 FROM rotation_ops.audit_photo_rotator() AS a
                 WHERE a.kind = 'reachable_relation' AND a.detail = 'public.photo') THEN
    RAISE EXCEPTION '[2a] 表の権限を付けても自己点検が検出しない';
  END IF;
  REVOKE SELECT ON public.photo FROM photo_rotator;

  CREATE FUNCTION public._verify_rotator_forgot_revoke() RETURNS integer
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT 1';
  IF NOT EXISTS (SELECT 1 FROM rotation_ops.audit_photo_rotator() AS a
                 WHERE a.kind = 'secdef_function' AND a.detail = 'public._verify_rotator_forgot_revoke()') THEN
    RAISE EXCEPTION '[2b] public の REVOKE 忘れを自己点検が検出しない';
  END IF;
  DROP FUNCTION public._verify_rotator_forgot_revoke();

  CREATE FUNCTION rotation_ops._verify_extra() RETURNS integer
    LANGUAGE sql SET search_path = pg_catalog, pg_temp AS 'SELECT 1';
  IF NOT EXISTS (SELECT 1 FROM rotation_ops.audit_photo_rotator() AS a
                 WHERE a.kind = 'ops_object' AND a.detail = 'function _verify_extra()') THEN
    RAISE EXCEPTION '[2c] rotation_ops への関数の追加を自己点検が検出しない';
  END IF;
  DROP FUNCTION rotation_ops._verify_extra();

  ALTER FUNCTION rotation_ops.apply_rotation(uuid, text, text, integer, integer, text, text) RESET search_path;
  IF NOT EXISTS (SELECT 1 FROM rotation_ops.audit_photo_rotator() AS a
                 WHERE a.kind = 'function_attribute' AND a.detail LIKE 'apply_rotation %') THEN
    RAISE EXCEPTION '[2d] search_path を外しても自己点検が検出しない';
  END IF;
  ALTER FUNCTION rotation_ops.apply_rotation(uuid, text, text, integer, integer, text, text)
    SET search_path = pg_catalog, pg_temp;

  ALTER ROLE photo_rotator CONNECTION LIMIT 5;
  IF NOT EXISTS (SELECT 1 FROM rotation_ops.audit_photo_rotator() AS a WHERE a.kind = 'role_attribute') THEN
    RAISE EXCEPTION '[2e] ロールの属性の変化を自己点検が検出しない';
  END IF;
  ALTER ROLE photo_rotator CONNECTION LIMIT 2;

  -- ---------------------------------------------------------------------
  -- 3. anon / authenticated / service_role からは呼べない
  -- ---------------------------------------------------------------------
  IF has_function_privilege('anon', f_apply, 'EXECUTE')
     OR has_function_privilege('authenticated', f_apply, 'EXECUTE')
     OR has_function_privilege('service_role', f_apply, 'EXECUTE')
     OR has_function_privilege('photo_scorer', f_apply, 'EXECUTE') THEN
    RAISE EXCEPTION '[3] apply_rotation を photo_rotator 以外が呼べる';
  END IF;
  IF has_schema_privilege('anon', 'rotation_ops', 'USAGE')
     OR has_schema_privilege('authenticated', 'rotation_ops', 'USAGE') THEN
    RAISE EXCEPTION '[3] anon / authenticated が rotation_ops を使える';
  END IF;

  -- ---------------------------------------------------------------------
  -- ここから photo_rotator に切り替えて挙動を見る
  -- ---------------------------------------------------------------------
  SELECT id INTO m FROM public.manhole ORDER BY id LIMIT 1;
  IF m IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;
  INSERT INTO public.photo (id, manhole_id, storage_key, width, height, file_size, sha256, content_type)
  VALUES (pid, m, k_old, 4032, 3024, 1000, repeat('b', 64), 'image/heic');
  UPDATE public.photo
  SET quality_score = 0.5, quality_score_version = 'quality_score/1.0.0', quality_scored_at = now(),
      ai_tags = '{"model":"scene_attrs/2","scene":"centered_clean","crop":[0,0,1,1],"lid":[0.1,0.1,0.9,0.9],"lid_fits":true,"plush_box":[0.1,0.1,0.2,0.2],"rep_score":1.5}'::jsonb
  WHERE id = pid;

  was_member := pg_has_role(current_user, 'photo_rotator', 'SET');
  IF NOT was_member THEN
    EXECUTE format('GRANT photo_rotator TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  END IF;
  SET LOCAL ROLE photo_rotator;

  -- 4. 表は直接読めない
  BEGIN
    PERFORM 1 FROM public.photo LIMIT 1;
    RAISE EXCEPTION '[4] photo_rotator が photo を直接読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM rotation_ops.operation_log LIMIT 1;
    RAISE EXCEPTION '[4] photo_rotator が operation_log を直接読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM 1 FROM rotation_ops.audit_photo_rotator();

  -- 5. 不正な入力はすべて拒否
  BEGIN PERFORM rotation_ops.apply_rotation(pid, k_old, k_new, 45, 2000, sha, 'human');
    RAISE EXCEPTION '[5] turn 45 を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM rotation_ops.apply_rotation(pid, k_old, k_new, 90, 2000, sha, 'robot');
    RAISE EXCEPTION '[5] 知らない source を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM rotation_ops.apply_rotation(pid, k_old, 'photos/design/original/x.jpg', 90, 2000, sha, 'human');
    RAISE EXCEPTION '[5] 形の違うキーを受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM rotation_ops.apply_rotation(pid, k_old, k_old, 90, 2000, sha, 'human');
    RAISE EXCEPTION '[5] 同じキーを受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM rotation_ops.apply_rotation(pid, k_old, k_new, 90, 0, sha, 'human');
    RAISE EXCEPTION '[5] file_size 0 を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM rotation_ops.apply_rotation(pid, k_old, k_new, 90, 2000, 'xyz', 'human');
    RAISE EXCEPTION '[5] 不正な sha256 を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;

  -- 6. 古いキーが違えば何もしない（楽観ロック）
  IF rotation_ops.apply_rotation(pid, 'photos/original/2026/11/00000000-0000-0000-0000-0000000fd199.jpg',
                                 k_new, 90, 2000, sha, 'human') THEN
    RAISE EXCEPTION '[6] 古いキーが違うのに差し替えた';
  END IF;

  -- 7. 差し替え: キー・大きさ・ハッシュ・縦横・採点・座標
  ok := rotation_ops.apply_rotation(pid, k_old, k_new, 90, 2000, sha, 'human');
  IF NOT ok THEN
    RAISE EXCEPTION '[7] 差し替えられなかった';
  END IF;
  RESET ROLE;
  SELECT * INTO row FROM public.photo WHERE id = pid;
  IF row.storage_key <> k_new OR row.file_size <> 2000 OR row.sha256 <> sha OR row.content_type <> 'image/jpeg'
     OR row.width <> 3024 OR row.height <> 4032
     OR row.quality_score_version IS NOT NULL OR row.quality_scored_at IS NOT NULL
     OR row.ai_tags ?| ARRAY['crop', 'lid', 'lid_fits', 'plush_box']
     OR row.ai_tags->>'scene' IS DISTINCT FROM 'centered_clean' OR row.ai_tags->>'rep_score' IS NULL THEN
    RAISE EXCEPTION '[7] 差し替えた行が想定と違う: %', to_jsonb(row) - 'exif';
  END IF;
  IF (SELECT count(*) FROM rotation_ops.operation_log WHERE photo_id = pid AND new_key = k_new AND turn = 90) <> 1 THEN
    RAISE EXCEPTION '[7] 記録が1行でない';
  END IF;

  -- 8. 新しいキーはほかの写真に使わせない・戻せる
  SET LOCAL ROLE photo_rotator;
  BEGIN PERFORM rotation_ops.apply_rotation(pid, k_new, k_new, 90, 2000, sha, 'human');
    RAISE EXCEPTION '[8] 使用中のキーを受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[8]%' THEN RAISE; END IF; END;
  IF NOT rotation_ops.apply_rotation(pid, k_new, k_old, 270, 1000, repeat('b', 64), 'revert') THEN
    RAISE EXCEPTION '[8] 戻せなかった';
  END IF;
  RESET ROLE;
  SELECT * INTO row FROM public.photo WHERE id = pid;
  IF row.storage_key <> k_old OR row.width <> 4032 OR row.height <> 3024 THEN
    RAISE EXCEPTION '[8] 戻した行が想定と違う';
  END IF;

  -- 9. 180° は縦横を入れ替えない
  SET LOCAL ROLE photo_rotator;
  PERFORM rotation_ops.apply_rotation(pid, k_old, k_new, 180, 2000, sha, 'auto');
  RESET ROLE;
  SELECT * INTO row FROM public.photo WHERE id = pid;
  IF row.width <> 4032 OR row.height <> 3024 THEN
    RAISE EXCEPTION '[9] 180° で縦横が入れ替わった';
  END IF;

  -- 10. anon / authenticated は呼べない
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM rotation_ops.apply_rotation(pid, k_new, k_old, 180, 1000, sha, 'revert');
    RAISE EXCEPTION '[10] anon が apply_rotation を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM rotation_ops.apply_rotation(pid, k_new, k_old, 180, 1000, sha, 'revert');
    RAISE EXCEPTION '[10] authenticated が apply_rotation を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- 検証行とメンバーシップを残さない
  DELETE FROM rotation_ops.operation_log WHERE photo_id = pid;
  DELETE FROM public.photo WHERE id = pid;
  IF NOT was_member THEN
    EXECUTE format('REVOKE photo_rotator FROM %I', current_user);
  END IF;

  RAISE NOTICE 'verify-photo-rotator: 全項目合格。検証行とメンバーシップは戻した。';
END $$;
