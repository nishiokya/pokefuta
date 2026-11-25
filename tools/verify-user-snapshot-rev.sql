-- 公開スタンプ帳スナップショットの版（変更ログ）を、ローカルスタックで実際に書き込んで確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20261125120000_user_snapshot_change_log.sql（PR #501）
--
-- 見ること:
--   - 権限: 変更ログ表はだれも直接読み書きできない。公開 RPC 2本だけ anon から呼べる。photo_scorer の自己点検が通る
--   - 公開データに効く変更（アプリを通らない UPDATE を含む）で版が変わり、関係ない人の版は変わらない
--   - 公開面に出ない変更（採点の quality_*・updated_at）では版が変わらない
--   - 版とデータが同じ時点（get_public_user_snapshot の rev = get_public_snapshot_rev）
-- 二接続の競合（所有者の付け替えと写真の更新・デッドロック）は tools/verify-user-snapshot-rev-race.sh。

DO $$
DECLARE
  a_uid uuid := '00000000-0000-0000-0000-00000000fa01';
  b_uid uuid := '00000000-0000-0000-0000-00000000fa02';
  q_uid uuid := '00000000-0000-0000-0000-00000000fa03';
  z_uid uuid := '00000000-0000-0000-0000-00000000fa04';
  a_app uuid := '00000000-0000-0000-0000-00000000fb01';
  b_app uuid := '00000000-0000-0000-0000-00000000fb02';
  q_app uuid := '00000000-0000-0000-0000-00000000fb03';
  a_v1 uuid := '00000000-0000-0000-0000-00000000fc01';
  a_v2 uuid := '00000000-0000-0000-0000-00000000fc02';
  b_v1 uuid := '00000000-0000-0000-0000-00000000fc03';
  a_p1 uuid := '00000000-0000-0000-0000-00000000fd01';
  b_p1 uuid := '00000000-0000-0000-0000-00000000fd02';
  a_p2 uuid := '00000000-0000-0000-0000-00000000fd03';
  a_p2_new uuid := '00000000-0000-0000-0000-00000000fd04';
  missing uuid := '00000000-0000-0000-0000-00000000ffff';
  dm uuid;
  mh bigint;
  ra text; rb text; rq text; r text;
  snap jsonb;
  n int;
BEGIN
  SELECT id INTO mh FROM public.manhole ORDER BY id LIMIT 1;
  IF mh IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;

  -- -------------------------------------------------------------------
  -- 1. 権限
  -- -------------------------------------------------------------------
  IF has_table_privilege('anon', 'public.user_snapshot_change', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_table_privilege('authenticated', 'public.user_snapshot_change', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_table_privilege('service_role', 'public.user_snapshot_change', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_any_column_privilege('anon', 'public.user_snapshot_change', 'SELECT, INSERT, UPDATE, REFERENCES')
     OR has_any_column_privilege('authenticated', 'public.user_snapshot_change', 'SELECT, INSERT, UPDATE, REFERENCES')
     OR has_sequence_privilege('anon', 'public.user_snapshot_change_id_seq', 'USAGE, SELECT, UPDATE')
     OR has_sequence_privilege('authenticated', 'public.user_snapshot_change_id_seq', 'USAGE, SELECT, UPDATE') THEN
    RAISE EXCEPTION '[1] anon / authenticated / service_role が変更ログ表・シーケンスに権限を持っている';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_snapshot_change'::regclass) THEN
    RAISE EXCEPTION '[1] 変更ログ表の RLS が無効';
  END IF;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.user_snapshot_change LIMIT 1;
    RAISE EXCEPTION '[1] anon が変更ログを読めている';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_snapshot_change (auth_uid) VALUES (NULL);
    RAISE EXCEPTION '[1] anon が変更ログに書けている';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.user_snapshot_change;
    RAISE EXCEPTION '[1] authenticated が変更ログを消せている';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.user_snapshot_change SET weight = 2;
    RAISE EXCEPTION '[1] authenticated が変更ログを書き換えられている';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  IF NOT has_function_privilege('anon', 'public.get_public_snapshot_rev(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_public_user_snapshot(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_public_user_snapshot(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '[1] 公開 RPC を anon / authenticated が呼べない';
  END IF;
  SELECT count(*) INTO n
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role', 'photo_scorer']) AS r(role)
  CROSS JOIN unnest(ARRAY[
    'public.user_snapshot_rev_of(uuid)', 'public.invalidate_all_user_snapshots()',
    'public.user_snapshot_log_visit()', 'public.user_snapshot_log_photo()',
    'public.user_snapshot_log_app_user()', 'public.user_snapshot_log_design_manhole()',
    'public.user_snapshot_log_all()'
  ]) AS f(sig)
  WHERE has_function_privilege(r.role, f.sig, 'EXECUTE');
  IF n > 0 THEN
    RAISE EXCEPTION '[1] 内部関数（合計・失効・トリガ）を外のロールが呼べる（% 件）', n;
  END IF;
  IF has_function_privilege('public', 'public.get_public_snapshot_rev(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '[1] get_public_snapshot_rev が PUBLIC に開いている（photo_scorer の自己点検が止まる）';
  END IF;
  -- ローカルには pg_net（net スキーマ）が入っていて、その分は本番に無い既知の警告（CLAUDE.md）
  SELECT count(*) INTO n FROM scoring.audit_photo_scorer() WHERE kind <> 'extension' AND detail NOT LIKE 'net.%';
  IF n > 0 THEN
    RAISE EXCEPTION '[1] photo_scorer の自己点検に違反が出た（% 件）: %', n,
      (SELECT string_agg(kind || ' ' || detail, ', ') FROM scoring.audit_photo_scorer() WHERE kind <> 'extension' AND detail NOT LIKE 'net.%');
  END IF;

  -- -------------------------------------------------------------------
  -- 2. 公開ID が無い → 1本で NULL（404）
  -- -------------------------------------------------------------------
  IF public.get_public_snapshot_rev(missing) IS NOT NULL OR public.get_public_user_snapshot(missing) IS NOT NULL THEN
    RAISE EXCEPTION '[2] 無い公開ID で NULL にならない';
  END IF;

  -- -------------------------------------------------------------------
  -- 準備: A（公開訪問あり）、B（関係ない人）、Q（訪問0件・フレンド募集 ON）
  -- -------------------------------------------------------------------
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (a_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'snapshot-rev-a@example.test', 'x', now(), now(), now()),
         (b_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'snapshot-rev-b@example.test', 'x', now(), now(), now()),
         (q_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'snapshot-rev-q@example.test', 'x', now(), now(), now());
  INSERT INTO public.app_user (id, auth_uid, display_name, pokemon_go_friend_code, pokemon_go_friend_open) VALUES
    (a_app, a_uid, '検証A', '111122223333', true),
    (b_app, b_uid, '検証B', NULL, false),
    (q_app, q_uid, '検証Q', '444455556666', true);
  INSERT INTO public.visit (id, user_id, manhole_id, shot_at, is_public, comment) VALUES
    (a_v1, a_uid, mh, now() - interval '2 day', true, '公開のコメント'),
    (a_v2, a_uid, mh, now() - interval '1 day', true, '最後に消す訪問'),
    (b_v1, b_uid, mh, now(), true, 'B の訪問');
  INSERT INTO public.photo (id, visit_id, manhole_id, storage_key) VALUES
    (a_p1, a_v1, mh, 'photos/original/verify-rev-a1.jpg'),
    (a_p2, a_v2, mh, 'photos/original/verify-rev-a2.jpg'),
    (b_p1, b_v1, mh, 'photos/original/verify-rev-b1.jpg');

  -- -------------------------------------------------------------------
  -- 3. 版とデータが同じ時点・中身が公開面どおり
  -- -------------------------------------------------------------------
  snap := public.get_public_user_snapshot(a_app);
  IF snap ->> 'rev' IS DISTINCT FROM public.get_public_snapshot_rev(a_app) THEN
    RAISE EXCEPTION '[3] get_public_user_snapshot の rev が get_public_snapshot_rev と違う';
  END IF;
  IF jsonb_array_length(snap -> 'cards') <> 2 OR jsonb_array_length(snap -> 'progressRows') <> 2
     OR (snap -> 'stats' ->> 'totalVisits')::int <> 2
     OR snap -> 'profile' ->> 'pokemon_go_friend_code' IS DISTINCT FROM '111122223333'
     OR snap -> 'cards' -> 0 ->> 'id' IS DISTINCT FROM a_v2::text  -- shot_at の新しい順
     OR (snap -> 'cards' -> 0) ? 'ord'
     OR (snap -> 'cards' -> 0) ? 'user_id'
     OR (snap -> 'progressRows' -> 0) ? 'user_id' THEN
    RAISE EXCEPTION '[3] スナップショットの中身が想定と違う: %', snap;
  END IF;
  IF snap::text LIKE '%' || a_uid::text || '%' THEN
    RAISE EXCEPTION '[3] スナップショットに auth_uid が入っている';
  END IF;

  -- -------------------------------------------------------------------
  -- 4. 公開データに効く変更で版が変わり、B は変わらない
  -- -------------------------------------------------------------------
  rb := public.get_public_snapshot_rev(b_app);

  ra := public.get_public_snapshot_rev(a_app);
  UPDATE public.photo SET quality_score = 0.5, quality_eligible = true WHERE id = a_p1;
  IF public.get_public_snapshot_rev(a_app) IS DISTINCT FROM ra THEN
    RAISE EXCEPTION '[4] 採点（quality_*）だけの更新で版が変わった';
  END IF;
  UPDATE public.visit SET updated_at = now() + interval '1 minute' WHERE id = a_v1;
  IF public.get_public_snapshot_rev(a_app) IS DISTINCT FROM ra THEN
    RAISE EXCEPTION '[4] updated_at だけの更新で版が変わった';
  END IF;

  UPDATE public.photo SET ai_tags = '{"model":"verify","plush":true}'::jsonb WHERE id = a_p1;
  IF public.get_public_snapshot_rev(a_app) = ra THEN
    RAISE EXCEPTION '[4] ai_tags の更新（自動採点）で版が変わらない';
  END IF;
  IF (public.get_public_user_snapshot(a_app) -> 'counts' ->> 'plush')::int <> 1 THEN
    RAISE EXCEPTION '[4] ぬいぐるみの件数が反映されていない';
  END IF;

  -- 運用 SQL での非公開化
  ra := public.get_public_snapshot_rev(a_app);
  UPDATE public.visit SET is_public = false WHERE id = a_v1;
  IF public.get_public_snapshot_rev(a_app) = ra THEN
    RAISE EXCEPTION '[4] 訪問の非公開化で版が変わらない';
  END IF;
  snap := public.get_public_user_snapshot(a_app);
  IF jsonb_array_length(snap -> 'cards') <> 1 OR snap::text LIKE '%公開のコメント%' THEN
    RAISE EXCEPTION '[4] 非公開にした訪問がスナップショットに残っている';
  END IF;

  -- フレンド募集 OFF
  ra := public.get_public_snapshot_rev(a_app);
  UPDATE public.app_user SET pokemon_go_friend_open = false WHERE id = a_app;
  IF public.get_public_snapshot_rev(a_app) = ra THEN
    RAISE EXCEPTION '[4] フレンド募集 OFF で版が変わらない';
  END IF;
  IF public.get_public_user_snapshot(a_app) -> 'profile' ->> 'pokemon_go_friend_code' IS NOT NULL THEN
    RAISE EXCEPTION '[4] フレンド募集 OFF なのにコードが出ている';
  END IF;

  -- 訪問0件の人のフレンド募集 OFF
  rq := public.get_public_snapshot_rev(q_app);
  UPDATE public.app_user SET pokemon_go_friend_open = false WHERE id = q_app;
  IF public.get_public_snapshot_rev(q_app) = rq THEN
    RAISE EXCEPTION '[4] 訪問0件の人のフレンド募集 OFF で版が変わらない';
  END IF;

  -- デザインマンホールの投稿と審査（published → hidden）
  ra := public.get_public_snapshot_rev(a_app);
  INSERT INTO public.design_manhole (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES (24.000000, 153.900000, 'photos/design/original/verify-rev.jpg', 'image/jpeg', 'published', a_uid)
  RETURNING id INTO dm;
  IF public.get_public_snapshot_rev(a_app) = ra THEN
    RAISE EXCEPTION '[4] デザインマンホールの投稿で版が変わらない';
  END IF;
  ra := public.get_public_snapshot_rev(a_app);
  UPDATE public.design_manhole SET status = 'hidden' WHERE id = dm;
  IF public.get_public_snapshot_rev(a_app) = ra THEN
    RAISE EXCEPTION '[4] デザインマンホールの非公開化（審査）で版が変わらない';
  END IF;
  IF (public.get_public_user_snapshot(a_app) -> 'counts' ->> 'designManhole')::int <> 0 THEN
    RAISE EXCEPTION '[4] 非公開にしたデザインマンホールが数えられている';
  END IF;

  -- 最後の公開訪問の削除（写真は cascade / 先に消す）
  ra := public.get_public_snapshot_rev(a_app);
  DELETE FROM public.photo WHERE visit_id = a_v2;
  DELETE FROM public.visit WHERE id = a_v2;
  IF public.get_public_snapshot_rev(a_app) = ra THEN
    RAISE EXCEPTION '[4] 最後の公開訪問の削除で版が変わらない';
  END IF;
  IF jsonb_array_length(public.get_public_user_snapshot(a_app) -> 'cards') <> 0 THEN
    RAISE EXCEPTION '[4] 削除した訪問がスナップショットに残っている';
  END IF;

  IF public.get_public_snapshot_rev(b_app) IS DISTINCT FROM rb THEN
    RAISE EXCEPTION '[4] A の変更で関係ない B の版が変わった';
  END IF;

  -- -------------------------------------------------------------------
  -- 5. 複数の人をまたぐ1文（自動採点の一括更新）で、各人の版が変わる
  -- -------------------------------------------------------------------
  UPDATE public.visit SET is_public = true WHERE id = a_v1;
  ra := public.get_public_snapshot_rev(a_app);
  rb := public.get_public_snapshot_rev(b_app);
  SELECT count(*) INTO n FROM public.user_snapshot_change;
  UPDATE public.photo SET ai_tags = '{"model":"verify","snow":true}'::jsonb WHERE id IN (a_p1, b_p1);
  IF public.get_public_snapshot_rev(a_app) = ra OR public.get_public_snapshot_rev(b_app) = rb THEN
    RAISE EXCEPTION '[5] 一括更新で版が変わらない人がいる';
  END IF;
  IF (SELECT count(*) FROM public.user_snapshot_change) - n <> 2 THEN
    RAISE EXCEPTION '[5] 1文で記録が訪問ごとに1行になっていない（% 行）', (SELECT count(*) FROM public.user_snapshot_change) - n;
  END IF;

  -- -------------------------------------------------------------------
  -- 6. 所有者の付け替え（名義訂正）・主キーを変える写真の移動・公開ID の対応の付け替え
  -- -------------------------------------------------------------------
  ra := public.get_public_snapshot_rev(a_app);
  rb := public.get_public_snapshot_rev(b_app);
  UPDATE public.visit SET user_id = b_uid WHERE id = a_v1;
  IF public.get_public_snapshot_rev(a_app) = ra OR public.get_public_snapshot_rev(b_app) = rb THEN
    RAISE EXCEPTION '[6] 訪問の付け替えで旧・新の持ち主の版が両方変わらない';
  END IF;
  UPDATE public.visit SET user_id = a_uid WHERE id = a_v1;

  -- a_p1 を、id を変えながら B の訪問へ移す
  ra := public.get_public_snapshot_rev(a_app);
  rb := public.get_public_snapshot_rev(b_app);
  INSERT INTO public.photo (id, visit_id, manhole_id, storage_key) VALUES (a_p2, a_v1, mh, 'photos/original/verify-rev-a2b.jpg');
  ra := public.get_public_snapshot_rev(a_app);
  UPDATE public.photo SET id = a_p2_new, visit_id = b_v1 WHERE id = a_p2;
  IF public.get_public_snapshot_rev(a_app) = ra OR public.get_public_snapshot_rev(b_app) = rb THEN
    RAISE EXCEPTION '[6] 主キーを変えた写真の移動で旧・新の訪問の持ち主の版が両方変わらない';
  END IF;

  -- 値の変わらない UPDATE では変わらない
  r := public.get_public_snapshot_rev(q_app);
  UPDATE public.app_user SET auth_uid = q_uid WHERE id = q_app;
  IF public.get_public_snapshot_rev(q_app) IS DISTINCT FROM r THEN
    RAISE EXCEPTION '[6] 値の変わらない UPDATE で版が変わった';
  END IF;
  -- 公開ID の対応（auth_uid）の付け替え: 公開ID 側（b）が必ず増える
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (z_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'snapshot-rev-z@example.test', 'x', now(), now(), now());
  UPDATE public.app_user SET auth_uid = z_uid WHERE id = q_app;
  IF split_part(public.get_public_snapshot_rev(q_app), '.', 2)::bigint <= split_part(r, '.', 2)::bigint THEN
    RAISE EXCEPTION '[6] 公開ID の対応の付け替えで公開ID 側の版が増えない';
  END IF;
  UPDATE public.app_user SET auth_uid = q_uid WHERE id = q_app;

  -- -------------------------------------------------------------------
  -- 7. 全員の失効（公開条件を変えるマイグレーション用）
  -- -------------------------------------------------------------------
  ra := public.get_public_snapshot_rev(a_app);
  rb := public.get_public_snapshot_rev(b_app);
  PERFORM public.invalidate_all_user_snapshots();
  IF public.get_public_snapshot_rev(a_app) = ra OR public.get_public_snapshot_rev(b_app) = rb THEN
    RAISE EXCEPTION '[7] 全員の失効で版が変わらない';
  END IF;

  -- -------------------------------------------------------------------
  -- 8. anon から公開 RPC を呼べる（PostgREST と同じロール）
  -- -------------------------------------------------------------------
  SET LOCAL ROLE anon;
  IF public.get_public_snapshot_rev(a_app) IS NULL OR public.get_public_user_snapshot(a_app) IS NULL THEN
    RAISE EXCEPTION '[8] anon から公開 RPC が引けない';
  END IF;
  RESET ROLE;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.photo WHERE id IN (a_p1, b_p1, a_p2, a_p2_new);
  DELETE FROM public.visit WHERE id IN (a_v1, a_v2, b_v1);
  DELETE FROM public.design_manhole WHERE id = dm;
  DELETE FROM public.app_user WHERE id IN (a_app, b_app, q_app);
  DELETE FROM auth.users WHERE id IN (a_uid, b_uid, q_uid, z_uid);
  DELETE FROM public.user_snapshot_change
   WHERE auth_uid IN (a_uid, b_uid, q_uid, z_uid) OR app_user_id IN (a_app, b_app, q_app)
      OR visit_id IN (a_v1, a_v2, b_v1);
  -- 7 の全員ぶんの行はローカルに残る（害はない。全員の版が1つ上がるだけ）

  RAISE NOTICE 'verify-user-snapshot-rev: 全項目合格。検証行は削除した。';
END $$;
