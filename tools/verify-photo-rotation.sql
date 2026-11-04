-- 写真の向きの差し替え scoring.apply_photo_rotation（自動採点ロール photo_scorer から呼ぶ）の権限と挙動を、
-- ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20261104120000_photo_rotation.sql
-- 自己点検の網そのもの（表・スキーマ・メンバーシップなど）は verify-photo-scorer.sql が見る。
-- ここでは足した関数が許可リストに入ったこと・属性の退行を検出すること・関数の挙動と入力検査を見る。
-- 検証のために postgres へ一時的に photo_scorer の SET を付与する（SET ROLE のため）。
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
  ts1 timestamptz;
  row public.photo%ROWTYPE;
  f_apply regprocedure := 'scoring.apply_photo_rotation(uuid,text,text,integer,integer,text,text)'::regprocedure;
BEGIN
  -- ---------------------------------------------------------------------
  -- 1. 自動採点の自己点検が違反を返さない（足した関数は許可リストに入っている。ローカルの pg_net は除く）
  -- ---------------------------------------------------------------------
  SELECT string_agg(a.kind || ': ' || a.detail, ', ') INTO bad
  FROM scoring.audit_photo_scorer() AS a
  WHERE NOT (a.kind IN ('reachable_relation', 'reachable_sequence') AND a.detail LIKE 'net.%')
    AND NOT (a.kind = 'extension' AND a.detail LIKE 'pg_net %');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[1] scoring.audit_photo_scorer() が違反を返した（本番の自動採点が止まる）: %', bad;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. 足した関数の属性が退行すると自己点検が検出する
  -- ---------------------------------------------------------------------
  ALTER FUNCTION scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text) RESET search_path;
  IF NOT EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a
                 WHERE a.kind = 'function_attribute' AND a.detail LIKE 'apply_photo_rotation %config=NULL') THEN
    RAISE EXCEPTION '[2a] search_path を外しても自己点検が検出しない';
  END IF;
  ALTER FUNCTION scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text)
    SET search_path = pg_catalog, pg_temp;
  ALTER FUNCTION scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text) SECURITY INVOKER;
  IF NOT EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a
                 WHERE a.kind = 'function_attribute' AND a.detail LIKE 'apply_photo_rotation %secdef=f %') THEN
    RAISE EXCEPTION '[2b] SECURITY DEFINER を外しても自己点検が検出しない';
  END IF;
  ALTER FUNCTION scoring.apply_photo_rotation(uuid, text, text, integer, integer, text, text) SECURITY DEFINER;
  IF EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a WHERE a.kind = 'function_attribute') THEN
    RAISE EXCEPTION '[2c] 属性を戻しても function_attribute が残る';
  END IF;

  -- ---------------------------------------------------------------------
  -- 3. photo_scorer だけが呼べる。差し替えの記録のスキーマには誰も入れない
  -- ---------------------------------------------------------------------
  IF has_function_privilege('anon', f_apply, 'EXECUTE')
     OR has_function_privilege('authenticated', f_apply, 'EXECUTE')
     OR has_function_privilege('service_role', f_apply, 'EXECUTE')
     OR NOT has_function_privilege('photo_scorer', f_apply, 'EXECUTE') THEN
    RAISE EXCEPTION '[3] apply_photo_rotation を呼べるロールが想定と違う';
  END IF;
  IF has_schema_privilege('anon', 'photo_rotation', 'USAGE')
     OR has_schema_privilege('authenticated', 'photo_rotation', 'USAGE')
     OR has_schema_privilege('service_role', 'photo_rotation', 'USAGE')
     OR has_schema_privilege('photo_scorer', 'photo_rotation', 'USAGE') THEN
    RAISE EXCEPTION '[3] photo_rotation スキーマを使えるロールがある';
  END IF;

  -- ---------------------------------------------------------------------
  -- ここから photo_scorer に切り替えて挙動を見る
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

  was_member := pg_has_role(current_user, 'photo_scorer', 'SET');
  IF NOT was_member THEN
    EXECUTE format('GRANT photo_scorer TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  END IF;
  SET LOCAL ROLE photo_scorer;

  -- 4. 表は直接読めない
  BEGIN
    PERFORM 1 FROM public.photo LIMIT 1;
    RAISE EXCEPTION '[4] photo_scorer が photo を直接読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM photo_rotation.operation_log LIMIT 1;
    RAISE EXCEPTION '[4] photo_scorer が差し替えの記録を直接読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM 1 FROM scoring.audit_photo_scorer();

  -- 5. 不正な入力はすべて拒否
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_old, k_new, 45, 2000, sha, 'human');
    RAISE EXCEPTION '[5] turn 45 を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_old, k_new, 90, 2000, sha, 'robot');
    RAISE EXCEPTION '[5] 知らない source を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_old, 'photos/design/original/x.jpg', 90, 2000, sha, 'human');
    RAISE EXCEPTION '[5] 形の違うキーを受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_old, k_old, 90, 2000, sha, 'human');
    RAISE EXCEPTION '[5] 同じキーを受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_old, k_new, 90, 0, sha, 'human');
    RAISE EXCEPTION '[5] file_size 0 を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_old, k_new, 90, 2000, 'xyz', 'human');
    RAISE EXCEPTION '[5] 不正な sha256 を受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[5]%' THEN RAISE; END IF; END;

  -- 6. 古いキーが違えば何もしない（楽観ロック）
  IF scoring.apply_photo_rotation(pid, 'photos/original/2026/11/00000000-0000-0000-0000-0000000fd199.jpg',
                                 k_new, 90, 2000, sha, 'human') THEN
    RAISE EXCEPTION '[6] 古いキーが違うのに差し替えた';
  END IF;

  -- 7. 差し替え: キー・大きさ・ハッシュ・縦横・採点・座標
  ok := scoring.apply_photo_rotation(pid, k_old, k_new, 90, 2000, sha, 'human');
  IF NOT ok THEN
    RAISE EXCEPTION '[7] 差し替えられなかった';
  END IF;
  RESET ROLE;
  SELECT * INTO row FROM public.photo WHERE id = pid;
  IF row.storage_key <> k_new OR row.file_size <> 2000 OR row.sha256 <> sha OR row.content_type <> 'image/jpeg'
     OR row.width <> 3024 OR row.height <> 4032
     OR row.quality_score_version IS NOT NULL OR row.quality_scored_at IS NULL
     OR row.ai_tags ?| ARRAY['crop', 'lid', 'lid_fits', 'plush_box']
     OR row.ai_tags->>'scene' IS DISTINCT FROM 'centered_clean' OR row.ai_tags->>'rep_score' IS NULL THEN
    RAISE EXCEPTION '[7] 差し替えた行が想定と違う: %', to_jsonb(row) - 'exif';
  END IF;
  IF (SELECT count(*) FROM photo_rotation.operation_log WHERE photo_id = pid AND new_key = k_new AND turn = 90) <> 1 THEN
    RAISE EXCEPTION '[7] 記録が1行でない';
  END IF;
  ts1 := row.quality_scored_at;

  -- 8. 新しいキーはほかの写真に使わせない・戻せる
  SET LOCAL ROLE photo_scorer;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_new, k_new, 90, 2000, sha, 'human');
    RAISE EXCEPTION '[8] 使用中のキーを受けた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[8]%' THEN RAISE; END IF; END;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_new,
      'photos/original/2026/11/00000000-0000-0000-0000-0000000fd199.jpg', 270, 1, sha, 'revert');
    RAISE EXCEPTION '[8] 記録の無いキーへ戻せた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[8]%' THEN RAISE; END IF; END;
  BEGIN PERFORM scoring.apply_photo_rotation(pid, k_new, k_old, 180, 1, NULL, 'revert');
    RAISE EXCEPTION '[8] 記録と合わない角度で戻せた'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[8]%' THEN RAISE; END IF; END;
  -- 戻すときは渡した値ではなく記録の元の値（HEIC の content_type・大きさ・ハッシュ）に戻る
  IF NOT scoring.apply_photo_rotation(pid, k_new, k_old, 270, 1, NULL, 'revert') THEN
    RAISE EXCEPTION '[8] 戻せなかった';
  END IF;
  RESET ROLE;
  SELECT * INTO row FROM public.photo WHERE id = pid;
  IF row.storage_key <> k_old OR row.width <> 4032 OR row.height <> 3024
     OR row.content_type <> 'image/heic' OR row.file_size <> 1000 OR row.sha256 <> repeat('b', 64) THEN
    RAISE EXCEPTION '[8] 戻した行が想定と違う: %', to_jsonb(row) - 'exif';
  END IF;
  -- 採点し直す前にもう一度差し替えても、採点の楽観ロック（版と採点時刻）が変わる
  IF row.quality_scored_at IS NULL OR row.quality_scored_at = ts1 THEN
    RAISE EXCEPTION '[8] 差し替えのたびに quality_scored_at が変わらない（採点の楽観ロックが効かない）';
  END IF;

  -- 9. 180° は縦横を入れ替えない
  SET LOCAL ROLE photo_scorer;
  PERFORM scoring.apply_photo_rotation(pid, k_old, k_new, 180, 2000, sha, 'auto');
  RESET ROLE;
  SELECT * INTO row FROM public.photo WHERE id = pid;
  IF row.width <> 4032 OR row.height <> 3024 THEN
    RAISE EXCEPTION '[9] 180° で縦横が入れ替わった';
  END IF;

  -- 10. anon / authenticated は呼べない
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM scoring.apply_photo_rotation(pid, k_new, k_old, 180, 1000, sha, 'revert');
    RAISE EXCEPTION '[10] anon が apply_rotation を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM scoring.apply_photo_rotation(pid, k_new, k_old, 180, 1000, sha, 'revert');
    RAISE EXCEPTION '[10] authenticated が apply_rotation を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- 検証行とメンバーシップを残さない
  DELETE FROM photo_rotation.operation_log WHERE photo_id = pid;
  DELETE FROM public.photo WHERE id = pid;
  IF NOT was_member THEN
    EXECUTE format('REVOKE photo_scorer FROM %I', current_user);
  END IF;

  RAISE NOTICE 'verify-photo-rotator: 全項目合格。検証行とメンバーシップは戻した。';
END $$;
