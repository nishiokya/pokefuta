-- 未掲載ポケふた（仮のポケふた）の権限と関数の挙動を、ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20261031150000_provisional_pokefuta.sql
--
-- 単一の DO 文なので、途中で落ちれば検証行もメンバーシップも巻き戻る。
-- 最後に受付を閉に戻し、検証行を消す。

DO $$
DECLARE
  u1 uuid := '00000000-0000-0000-0000-0000000aa001';
  u2 uuid := '00000000-0000-0000-0000-0000000aa002';
  official integer;
  official2 integer;
  pref integer;
  bad text;
  was_member boolean;
  pm1 uuid;
  pm2 uuid;
  pm_tmp uuid;
  ph1 uuid;
  ph2 uuid;
  ph_hidden uuid;
  hint1 uuid;
  r record;
  j jsonb;
  n bigint;
  ok boolean;
  k text;
  visits_before bigint;

  -- 写真の登録（service_role の経路）。保存キーは毎回別の uuid
  -- p_provisional_id が NULL なら新規
BEGIN
  SELECT id INTO official FROM public.manhole ORDER BY id LIMIT 1;
  SELECT id INTO official2 FROM public.manhole ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO pref FROM public.prefecture ORDER BY id LIMIT 1;
  IF official IS NULL OR official2 IS NULL OR pref IS NULL THEN
    RAISE EXCEPTION 'manhole（2件以上）/ prefecture が無い。シードを流してから実行すること';
  END IF;

  -- -------------------------------------------------------------------
  -- 1. 運営ロールの自己点検が違反を返さない（ローカルの pg_net は警告）
  --    photo_scorer の自己点検も、この機能の public の関数で崩れていない
  -- -------------------------------------------------------------------
  SELECT string_agg(a.kind || ': ' || a.detail, ', ') INTO bad
  FROM provisional_ops.audit_operator() AS a
  WHERE NOT (a.kind IN ('reachable_relation', 'reachable_sequence') AND a.detail LIKE 'net.%')
    AND NOT (a.kind = 'extension' AND a.detail LIKE 'pg_net %');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[1] provisional_ops.audit_operator() が違反を返した: %', bad;
  END IF;
  SELECT string_agg(a.kind || ': ' || a.detail, ', ') INTO bad
  FROM scoring.audit_photo_scorer() AS a
  WHERE NOT (a.kind IN ('reachable_relation', 'reachable_sequence') AND a.detail LIKE 'net.%')
    AND NOT (a.kind = 'extension' AND a.detail LIKE 'pg_net %');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[1] scoring.audit_photo_scorer() が違反を返した（REVOKE FROM PUBLIC の書き忘れ？）: %', bad;
  END IF;

  -- 点検が効く: 表の権限を足すと検出する
  GRANT SELECT ON public.provisional_photo TO provisional_operator;
  IF NOT EXISTS (SELECT 1 FROM provisional_ops.audit_operator() AS a
                 WHERE a.kind = 'reachable_relation' AND a.detail = 'public.provisional_photo') THEN
    RAISE EXCEPTION '[1] 表の権限を足しても自己点検が検出しない';
  END IF;
  REVOKE SELECT ON public.provisional_photo FROM provisional_operator;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'provisional-u1@example.test', 'x', now(), now(), now()),
         (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'provisional-u2@example.test', 'x', now(), now(), now());
  INSERT INTO public.app_user (auth_uid, display_name) VALUES (u1, '仮の人1'), (u2, '仮の人2');

  -- -------------------------------------------------------------------
  -- 2. anon / authenticated は表を直接読み書きできず、写真の登録関数も呼べない
  -- -------------------------------------------------------------------
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.provisional_photo;
    RAISE EXCEPTION '[2] anon が provisional_photo を読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.provisional_add_hint(gen_random_uuid(), NULL, NULL, 'x', NULL, NULL);
    RAISE EXCEPTION '[2] anon が provisional_add_hint を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.provisional_manhole (title, prefecture_id, created_by) VALUES ('x', pref, u1);
    RAISE EXCEPTION '[2] authenticated が provisional_manhole に直接書けた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.provisional_submit_photo(u1, NULL, 'x', pref, NULL,
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL);
    RAISE EXCEPTION '[2] authenticated が provisional_submit_photo を呼べた（画像処理を迂回できる）';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- -------------------------------------------------------------------
  -- 3. 受付が閉のあいだは写真も手がかりも入らない（初期値は閉）
  -- -------------------------------------------------------------------
  IF public.provisional_is_accepting() THEN
    RAISE EXCEPTION '[3] 受付の初期値が開になっている';
  END IF;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.provisional_submit_photo(u1, NULL, '新しいふた', pref, '検証市',
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 2048, 1536, 100000, NULL, now(), NULL);
    RAISE EXCEPTION '[3] 受付が閉なのに写真が入った';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%受付を停止%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- 運営ロールで開く（検証のため postgres に一時的に SET を付ける）
  was_member := pg_has_role(current_user, 'provisional_operator', 'SET');
  IF NOT was_member THEN
    EXECUTE format('GRANT provisional_operator TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  END IF;
  SET LOCAL ROLE provisional_operator;
  BEGIN
    PERFORM 1 FROM public.provisional_manhole;
    RAISE EXCEPTION '[3] 運営ロールが表を直接読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.provisional_submit_photo(u1, NULL, 'x', pref, NULL,
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL);
    RAISE EXCEPTION '[3] 運営ロールが写真の登録関数を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM provisional_ops.set_accepting(true, '検証');
  RESET ROLE;

  -- -------------------------------------------------------------------
  -- 4. 新規登録（写真と同時）・追加・上限 5枚/24時間・保存キーの形
  -- -------------------------------------------------------------------
  SET LOCAL ROLE service_role;
  SELECT s.provisional_manhole_id, s.photo_id INTO pm1, ph1
  FROM public.provisional_submit_photo(u1, NULL, '新しいふた', pref, '検証市',
    'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 2048, 1536, 100000,
    repeat('a', 64), now() - interval '1 hour', '最初の写真') AS s;
  SELECT s.photo_id INTO ph2
  FROM public.provisional_submit_photo(u2, pm1, NULL, NULL, NULL,
    'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 2048, 1536, 100000, NULL, now(), NULL) AS s;
  SELECT s.photo_id INTO ph_hidden
  FROM public.provisional_submit_photo(u2, pm1, NULL, NULL, NULL,
    'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 2048, 1536, 100000, NULL, now(), NULL) AS s;
  SELECT s.provisional_manhole_id INTO pm2
  FROM public.provisional_submit_photo(u1, NULL, '重複のふた', pref, NULL,
    'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 2048, 1536, 100000, NULL, now(), NULL) AS s;

  BEGIN
    PERFORM public.provisional_submit_photo(u1, NULL, 'x', pref, NULL, 'photos/original/2026/10/evil.png',
      1, 1, 1, NULL, now(), NULL);
    RAISE EXCEPTION '[4] 形の違う保存キーが入った';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.provisional_submit_photo(u1, NULL, '   ', pref, NULL,
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL);
    RAISE EXCEPTION '[4] 空の呼び名で入った';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.provisional_submit_photo(u1, NULL, 'x', pref, NULL,
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now() + interval '3 days', NULL);
    RAISE EXCEPTION '[4] 未来の撮影日時が入った';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- u1 は 2枚。あと3枚で上限（5枚）
  FOR n IN 1..3 LOOP
    PERFORM public.provisional_submit_photo(u1, pm2, NULL, NULL, NULL,
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL);
  END LOOP;
  BEGIN
    PERFORM public.provisional_submit_photo(u1, pm2, NULL, NULL, NULL,
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL);
    RAISE EXCEPTION '[4] 6枚目が入った（上限が効いていない）';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%上限%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- -------------------------------------------------------------------
  -- 5. 手がかり・通報・取り下げ（本人は auth.uid()）
  -- -------------------------------------------------------------------
  UPDATE public.provisional_manhole SET updated_at = now() - interval '30 days' WHERE id = pm1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  hint1 := public.provisional_add_hint(pm1, 35.68, 139.76, '検証公園', 'https://example.test/news', '入口の近く');
  RESET ROLE;
  IF (SELECT updated_at FROM public.provisional_manhole WHERE id = pm1) < now() THEN
    RAISE EXCEPTION '[5] 手がかりを足しても仮ポケふたの updated_at が進まない（運営の recent() に出ない）';
  END IF;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.provisional_add_hint(pm1, NULL, NULL, NULL, NULL, 'メモだけ');
    RAISE EXCEPTION '[5] 座標・施設名・URL のどれも無い手がかりが入った';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.provisional_add_hint(pm1, 10, 10, NULL, NULL, NULL);
    RAISE EXCEPTION '[5] 日本の外の座標が入った';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.provisional_add_hint(pm1, NULL, NULL, NULL, 'javascript:alert(1)', NULL);
    RAISE EXCEPTION '[5] http(s) 以外の URL が入った';
  EXCEPTION WHEN check_violation THEN NULL; END;

  PERFORM public.provisional_report_target('photo', ph1, 'ちがうふた');
  PERFORM public.provisional_report_target('photo', ph1, 'もう一度');
  RESET ROLE;
  SELECT count(*) INTO n FROM public.provisional_report WHERE reporter_user_id = u2;
  IF n <> 1 THEN
    RAISE EXCEPTION '[5] 同じ人の同じ対象への通報が % 件になった（1件のはず）', n;
  END IF;

  SET LOCAL ROLE authenticated;
  -- u2 は u1 の写真を取り下げられない
  IF public.provisional_withdraw_photo(ph1) THEN
    RAISE EXCEPTION '[5] 他人の写真を取り下げられた';
  END IF;
  SELECT count(*) INTO n FROM public.provisional_my_photos();
  IF n <> 2 THEN
    RAISE EXCEPTION '[5] 本人の一覧が % 枚（2枚のはず）', n;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- -------------------------------------------------------------------
  -- 6. 公開: 一覧・詳細は公開中だけ。auth の id を返さない。非表示の写真は配信キーが出ない
  -- -------------------------------------------------------------------
  SET LOCAL ROLE provisional_operator;
  PERFORM provisional_ops.set_status('photo', ph_hidden, 'hidden', '検証');
  RESET ROLE;

  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.provisional_list() AS l WHERE l.id IN (pm1, pm2);
  IF n <> 2 THEN
    RAISE EXCEPTION '[6] 一覧に % 件（2件のはず）', n;
  END IF;
  j := public.provisional_detail(pm1);
  IF jsonb_array_length(j->'photos') <> 2 THEN
    RAISE EXCEPTION '[6] 詳細の写真が % 枚（非表示を除いて2枚のはず）', jsonb_array_length(j->'photos');
  END IF;
  IF j::text LIKE '%' || u1::text || '%' OR j::text LIKE '%' || u2::text || '%' OR j::text LIKE '%photos/original%' THEN
    RAISE EXCEPTION '[6] 詳細に auth の id か保存キーが出ている';
  END IF;
  IF public.provisional_photo_key(ph_hidden) IS NOT NULL THEN
    RAISE EXCEPTION '[6] 非表示の写真の保存キーが返った';
  END IF;
  IF public.provisional_photo_key(ph1) IS NULL THEN
    RAISE EXCEPTION '[6] 公開中の写真の保存キーが返らない';
  END IF;
  BEGIN
    PERFORM * FROM public.provisional_my_photos();
    RAISE EXCEPTION '[6] anon が provisional_my_photos を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- -------------------------------------------------------------------
  -- 7. 重複のまとめ: 写真・手がかりが移り、元は merged。merged / 自分自身は拒否
  -- -------------------------------------------------------------------
  SET LOCAL ROLE provisional_operator;
  j := provisional_ops.merge(pm2, pm1, '同じふた');
  IF (j->>'photos')::int <> 4 THEN
    RAISE EXCEPTION '[7] まとめで移った写真が %（4枚のはず）', j->>'photos';
  END IF;
  BEGIN
    PERFORM provisional_ops.merge(pm2, pm1, 'もう一度');
    RAISE EXCEPTION '[7] merged をもう一度まとめられた';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%open で公開中であること%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM provisional_ops.merge(pm1, pm1, '自分');
    RAISE EXCEPTION '[7] 自分自身へまとめられた';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  RESET ROLE;
  -- 非表示の仮ポケふたはまとめられない（中の写真が公開に戻るため）
  SET LOCAL ROLE service_role;
  SELECT s.provisional_manhole_id INTO pm_tmp
  FROM public.provisional_submit_photo(u2, NULL, '非表示でまとめる', pref, NULL,
    'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL) AS s;
  RESET ROLE;
  SET LOCAL ROLE provisional_operator;
  PERFORM provisional_ops.set_status('manhole', pm_tmp, 'hidden', '検証');
  BEGIN
    PERFORM provisional_ops.merge(pm_tmp, pm1, '非表示から');
    RAISE EXCEPTION '[7] 非表示の仮ポケふたをまとめられた';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%open で公開中であること%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  IF public.provisional_detail(pm2)->>'merged_into_id' IS DISTINCT FROM pm1::text THEN
    RAISE EXCEPTION '[7] まとめた元の詳細が転送先を返さない';
  END IF;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.provisional_submit_photo(u2, pm2, NULL, NULL, NULL,
      'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL);
    RAISE EXCEPTION '[7] まとめた元に写真を追加できた';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%受付を終えた%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- -------------------------------------------------------------------
  -- 8. 正式IDへの移行: 公開中の写真1枚ごとに visit＋photo。shot_location は無し。
  --    再実行で増えない。別の正式IDは拒否。非表示の写真は移らない
  -- -------------------------------------------------------------------
  SELECT count(*) INTO visits_before FROM public.visit WHERE user_id IN (u1, u2);
  SET LOCAL ROLE provisional_operator;
  j := provisional_ops.preview_link(pm1, official);
  IF (j->>'photos_to_transfer')::int <> 6 OR (j->>'photos_not_transferred')::int <> 1 THEN
    RAISE EXCEPTION '[8] 移行の確認が想定と違う: %', j;
  END IF;
  j := provisional_ops.link(pm1, official, '公式復旧');
  IF jsonb_array_length(j->'moved') <> 6 THEN
    RAISE EXCEPTION '[8] 移った写真が %（6枚のはず。まとめた4枚を含む）', jsonb_array_length(j->'moved');
  END IF;
  j := provisional_ops.link(pm1, official, '再実行');
  IF jsonb_array_length(j->'moved') <> 0 THEN
    RAISE EXCEPTION '[8] 再実行でまた移った（%）', jsonb_array_length(j->'moved');
  END IF;
  BEGIN
    PERFORM provisional_ops.link(pm1, official2, '別のID');
    RAISE EXCEPTION '[8] 別の正式IDへ結びつけ直せた';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%結びつけ済み%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM provisional_ops.link(pm2, official, 'まとめ済み');
    RAISE EXCEPTION '[8] まとめ済みを結びつけられた';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%まとめ済み%' THEN RAISE; END IF;
  END;
  -- 移した後の写真は仮の側で非表示にできない（通常の visit の側で扱う）
  BEGIN
    PERFORM provisional_ops.set_status('photo', ph1, 'hidden', '移した後');
    RAISE EXCEPTION '[8] 移した写真を仮の側で非表示にできた（公開は止まらないのに成功になる）';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%移し済み%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  SELECT count(*) INTO n FROM public.visit WHERE user_id IN (u1, u2);
  IF n - visits_before <> 6 THEN
    RAISE EXCEPTION '[8] visit が % 件増えた（6件のはず）', n - visits_before;
  END IF;
  IF EXISTS (SELECT 1 FROM public.visit v
             JOIN public.provisional_photo ph ON ph.transferred_visit_id = v.id
             WHERE v.shot_location IS NOT NULL OR v.location_source <> 'none'
                OR v.manhole_id <> official OR v.shot_at <> ph.shot_at OR v.user_id <> ph.user_id) THEN
    RAISE EXCEPTION '[8] 移した visit の中身が想定と違う（撮影位置が入った等）';
  END IF;
  IF EXISTS (SELECT 1 FROM public.photo p
             JOIN public.provisional_photo ph ON ph.transferred_photo_id = p.id
             WHERE p.storage_key <> ph.storage_key OR p.manhole_id <> official
                OR p.visit_id <> ph.transferred_visit_id) THEN
    RAISE EXCEPTION '[8] 移した photo の中身が想定と違う';
  END IF;
  IF EXISTS (SELECT 1 FROM public.provisional_photo WHERE id = ph_hidden AND transferred_visit_id IS NOT NULL) THEN
    RAISE EXCEPTION '[8] 非表示の写真が移った';
  END IF;
  IF public.provisional_detail(pm1)->>'official_manhole_id' IS DISTINCT FROM official::text THEN
    RAISE EXCEPTION '[8] 移した仮ポケふたの詳細が正式IDを返さない';
  END IF;
  IF public.provisional_photo_key(ph1) IS NOT NULL THEN
    RAISE EXCEPTION '[8] 移した写真が仮の配信からまだ出る';
  END IF;

  -- 非表示の仮ポケふたは移せない（移すと写真が公開に戻る）
  SET LOCAL ROLE service_role;
  SELECT s.provisional_manhole_id INTO pm2
  FROM public.provisional_submit_photo(u2, NULL, '非表示のふた', pref, NULL,
    'photos/original/2026/10/' || gen_random_uuid() || '.jpg', 1, 1, 1, NULL, now(), NULL) AS s;
  RESET ROLE;
  SET LOCAL ROLE provisional_operator;
  PERFORM provisional_ops.set_status('manhole', pm2, 'hidden', '検証');
  BEGIN
    PERFORM provisional_ops.link(pm2, official, '非表示');
    RAISE EXCEPTION '[8] 非表示の仮ポケふたを移せた';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '[%' OR SQLERRM NOT LIKE '%非表示の仮ポケふたは移さない%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- 作った人（u1）が退会しても、他の人の写真が載った仮ポケふたは残る
  DELETE FROM public.photo WHERE id IN (SELECT transferred_photo_id FROM public.provisional_photo WHERE user_id = u1);
  DELETE FROM public.visit WHERE user_id = u1;
  DELETE FROM public.app_user WHERE auth_uid = u1;
  DELETE FROM auth.users WHERE id = u1;
  IF NOT EXISTS (SELECT 1 FROM public.provisional_manhole WHERE id = pm1 AND created_by IS NULL) THEN
    RAISE EXCEPTION '[8] 作った人の退会で仮ポケふたが消えた（または created_by が残った）';
  END IF;
  IF EXISTS (SELECT 1 FROM public.provisional_photo WHERE user_id = u1) THEN
    RAISE EXCEPTION '[8] 退会した人の写真が残った';
  END IF;

  -- -------------------------------------------------------------------
  -- 9. 運営の操作はログに残る。anon / authenticated は provisional_ops を呼べない
  -- -------------------------------------------------------------------
  SELECT count(*) INTO n FROM provisional_ops.operation_log
  WHERE created_at >= now() AND actor IS NOT NULL;
  IF n < 5 THEN
    RAISE EXCEPTION '[9] 運営の操作ログが % 件（set_accepting / set_status / merge / link×2 で5件以上のはず）', n;
  END IF;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM provisional_ops.set_accepting(false, 'x');
    RAISE EXCEPTION '[9] authenticated が provisional_ops を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- 後片付け: 受付を閉に戻し、検証行とメンバーシップを消す
  UPDATE public.provisional_setting SET accepting = false WHERE id;
  DELETE FROM public.photo WHERE id IN (SELECT transferred_photo_id FROM public.provisional_photo WHERE user_id IN (u1, u2));
  DELETE FROM public.visit WHERE user_id IN (u1, u2);
  DELETE FROM public.provisional_report WHERE reporter_user_id IN (u1, u2);
  DELETE FROM public.provisional_location_hint WHERE user_id IN (u1, u2);
  DELETE FROM public.provisional_photo WHERE user_id IN (u1, u2);
  DELETE FROM public.provisional_manhole WHERE merged_into_id = pm1;
  DELETE FROM public.provisional_manhole WHERE id IN (pm1, pm2, pm_tmp) OR created_by IN (u1, u2);
  DELETE FROM provisional_ops.operation_log WHERE created_at >= now();
  DELETE FROM public.app_user WHERE auth_uid IN (u1, u2);
  DELETE FROM auth.users WHERE id IN (u1, u2);
  IF NOT was_member THEN
    EXECUTE format('REVOKE provisional_operator FROM %I', current_user);
  END IF;

  RAISE NOTICE 'verify-provisional: 全項目合格。検証行とメンバーシップは戻した。';
END $$;
