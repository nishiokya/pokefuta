-- app_user の公開面を、ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20260810140000_app_user_public_surface_and_pokemon_go_friend_code.sql
--
-- 背景: 2026-08-10 まで app_user は
--   - テーブル単位の GRANT SELECT（列ACLは入っていたが、テーブル単位に上書きされて無効）
--   - RLS の SELECT が USING (true) のポリシー2本
-- だったため、全ユーザーの全列（auth_uid・bio・SNS URL）が anon から読めていた。
--
-- ここは「オブジェクトが存在すること」ではなく「実際に誰が何を読めるか」を見る。
-- プロフィールに列を足すときは、この検査に anon から読めないことのケースを足すこと。

DO $$
DECLARE
  owner_id  uuid := '00000000-0000-0000-0000-00000000ea01';
  other_id  uuid := '00000000-0000-0000-0000-00000000ea02';
  quiet_id  uuid := '00000000-0000-0000-0000-00000000ea03';
  owner_app uuid := '00000000-0000-0000-0000-00000000eb01';
  other_app uuid := '00000000-0000-0000-0000-00000000eb02';
  quiet_app uuid := '00000000-0000-0000-0000-00000000eb03';
  pub_visit uuid := '00000000-0000-0000-0000-00000000ec01';
  priv_visit uuid := '00000000-0000-0000-0000-00000000ec02';
  target_manhole bigint;
  n int;
  txt text;
BEGIN
  SELECT id INTO target_manhole FROM public.manhole ORDER BY id LIMIT 1;
  IF target_manhole IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'app-user-visibility-owner@example.test', 'x', now(), now(), now()),
         (other_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'app-user-visibility-other@example.test', 'x', now(), now(), now()),
         (quiet_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'app-user-visibility-quiet@example.test', 'x', now(), now(), now());

  -- owner: 公開訪問あり / quiet: 非公開訪問だけ
  -- owner は Pokémon GO フレンド募集を ON にしてある
  INSERT INTO public.app_user (
    id, auth_uid, display_name, bio, x_url, instagram_url,
    pokemon_go_friend_code, pokemon_go_friend_note, pokemon_go_friend_open
  ) VALUES
    (owner_app, owner_id, '検証オーナー', '検証用の一言', 'https://x.com/verify', NULL,
     '123456789012', '毎日ギフト交換できる方歓迎', true),
    (other_app, other_id, '検証他人',     NULL,          NULL,                    NULL,
     NULL, NULL, false),
    (quiet_app, quiet_id, '検証サイレント', '公開訪問が無い人', NULL,              NULL,
     NULL, NULL, false);

  INSERT INTO public.visit (id, user_id, manhole_id, shot_at, is_public) VALUES
    (pub_visit,  owner_id, target_manhole, now(), true),
    (priv_visit, quiet_id, target_manhole, now(), false);

  -- ---------------------------------------------------------------------
  -- 1. anon は app_user を1列も読めない
  --    anon キーはクライアントバンドルに入っているので、ここが唯一の境界。
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM auth_uid FROM public.app_user WHERE id = owner_app;
    RAISE EXCEPTION '[1] anon が app_user.auth_uid を読めている';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- 期待どおり
  END;

  BEGIN
    PERFORM display_name FROM public.app_user WHERE id = owner_app;
    RAISE EXCEPTION '[2] anon が app_user.display_name を読めている';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- 期待どおり
  END;

  -- ---------------------------------------------------------------------
  -- 3. anon は公開ユーザーの情報を RPC 経由でなら読める（過剰に絞っていない）
  --    公開スタンプ帳はこの経路だけで成り立っている。
  -- ---------------------------------------------------------------------
  SELECT display_name INTO txt FROM public.get_public_user_info(owner_app);
  IF txt IS DISTINCT FROM '検証オーナー' THEN
    RAISE EXCEPTION '[3] get_public_user_info が公開ユーザーを返さない（% ）', txt;
  END IF;

  -- ---------------------------------------------------------------------
  -- 3b. anon はトレーナーコードを列として直接読めない
  --     公開スイッチは「他の列の値による出し分け」なので、列 GRANT では表現できない。
  --     直接読める経路が1つでもあると、スイッチ OFF の人のコードが出る。
  -- ---------------------------------------------------------------------
  BEGIN
    PERFORM pokemon_go_friend_code FROM public.app_user WHERE id = owner_app;
    RAISE EXCEPTION '[3b] anon が pokemon_go_friend_code を直接読めている';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- 期待どおり
  END;

  -- ---------------------------------------------------------------------
  -- 3c. 募集中ならコードと一言が RPC から返る
  -- ---------------------------------------------------------------------
  SELECT pokemon_go_friend_code INTO txt FROM public.get_public_user_info(owner_app);
  IF txt IS DISTINCT FROM '123456789012' THEN
    RAISE EXCEPTION '[3c] 募集中なのにトレーナーコードが返らない（%）', txt;
  END IF;

  -- ---------------------------------------------------------------------
  -- 3d. スイッチを OFF にするとコードも一言も返らない
  --     ここが機能の肝。UI で隠すだけでは anon キーの直叩きで漏れる。
  -- ---------------------------------------------------------------------
  RESET ROLE;
  UPDATE public.app_user SET pokemon_go_friend_open = false WHERE id = owner_app;
  SET LOCAL ROLE anon;

  SELECT pokemon_go_friend_code INTO txt FROM public.get_public_user_info(owner_app);
  IF txt IS NOT NULL THEN
    RAISE EXCEPTION '[3d] 募集OFFなのにトレーナーコードが返っている（%）', txt;
  END IF;
  SELECT pokemon_go_friend_note INTO txt FROM public.get_public_user_info(owner_app);
  IF txt IS NOT NULL THEN
    RAISE EXCEPTION '[3d] 募集OFFなのに一言が返っている（%）', txt;
  END IF;

  -- 表示名は募集スイッチと無関係に出る（過剰に絞っていない）
  SELECT display_name INTO txt FROM public.get_public_user_info(owner_app);
  IF txt IS DISTINCT FROM '検証オーナー' THEN
    RAISE EXCEPTION '[3d] 募集OFFで表示名まで消えている（%）', txt;
  END IF;

  RESET ROLE;
  UPDATE public.app_user SET pokemon_go_friend_open = true WHERE id = owner_app;
  SET LOCAL ROLE anon;

  -- ---------------------------------------------------------------------
  -- 4. 公開訪問が無いユーザーは RPC からも引けない
  --    auth_uid は visit.user_id から引ける値なので、公開訪問を持つ人の分は
  --    どのみち露出している。公開訪問が無い人だけがこの関数から漏れていた（#187）。
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.get_public_user_info(quiet_app);
  IF n <> 0 THEN
    RAISE EXCEPTION '[4] 公開訪問が無いユーザーを get_public_user_info が返している（% 行）', n;
  END IF;

  RESET ROLE;

  -- ---------------------------------------------------------------------
  -- 5. ログイン済みユーザーは自分の行のバッジ列を読める
  --    /api/badges/{global,prefectures} がこの経路。
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n
  FROM public.app_user
  WHERE auth_uid = owner_id
    AND all_prefectures_completed_at IS NOT DISTINCT FROM NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION '[5] 自分の行のバッジ列が読めない（% 行）。/api/badges/* が壊れる', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 6. ログイン済みユーザーでも bio / SNS URL は読めない（列権限）
  -- ---------------------------------------------------------------------
  BEGIN
    PERFORM bio FROM public.app_user WHERE auth_uid = owner_id;
    RAISE EXCEPTION '[6] authenticated が bio を直接読めている';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- 期待どおり
  END;

  -- ---------------------------------------------------------------------
  -- 7. 他人の行は読めない（RLS）
  --    以前は USING (true) だったので全ユーザーを列挙できた。
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.app_user WHERE auth_uid = other_id;
  IF n <> 0 THEN
    RAISE EXCEPTION '[7] 他人の app_user 行を読めている（% 行）', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 8. 自分のプロフィール取得（get_own_profile）が権限で落ちない
  --    列権限を絞ると SECURITY DEFINER でない経路が 42501 で落ちる。
  --    photo で INSERT ... RETURNING が壊れたのと同じ壊れ方をここで防ぐ。
  -- ---------------------------------------------------------------------
  SELECT display_name INTO txt FROM public.get_own_profile();
  IF txt IS DISTINCT FROM '検証オーナー' THEN
    RAISE EXCEPTION '[8] get_own_profile が自分のプロフィールを返さない（% ）', txt;
  END IF;

  -- ---------------------------------------------------------------------
  -- 9. ログイン時の app_user 作成（upsert_app_user）が権限で落ちない
  --    ensureAppUser がこの経路。落ちると新規ログインが壊れる。
  -- ---------------------------------------------------------------------
  PERFORM public.upsert_app_user(owner_id, '検証オーナー');

  -- ---------------------------------------------------------------------
  -- 10. トレーナーコードは貼り付けたままの形でも保存できる
  --     ゲーム画面は `1234 5678 9012` と4桁区切りで表示する。利用者はそれをコピーして
  --     貼るので、空白で弾かずに数字12桁へ正規化する。
  -- ---------------------------------------------------------------------
  PERFORM public.update_own_public_profile(
    '検証オーナー', NULL, NULL, NULL, '1234 5678 9012', 'ギフト交換歓迎', true);

  RESET ROLE;
  SELECT pokemon_go_friend_code INTO txt FROM public.app_user WHERE id = owner_app;
  IF txt IS DISTINCT FROM '123456789012' THEN
    RAISE EXCEPTION '[10] 空白区切りのコードが12桁に正規化されない（%）', txt;
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------------
  -- 11. 12桁でないコードは保存できない
  -- ---------------------------------------------------------------------
  BEGIN
    PERFORM public.update_own_public_profile(
      '検証オーナー', NULL, NULL, NULL, '12345', NULL, true);
    RAISE EXCEPTION '[11] 12桁でないトレーナーコードが保存できてしまう';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%Invalid Pokemon GO friend code%' THEN RAISE; END IF;
  END;

  -- ---------------------------------------------------------------------
  -- 12. コードを消すと募集も止まる
  --     「募集中」と出ているのに申請手段が無い状態を作らない。
  -- ---------------------------------------------------------------------
  PERFORM public.update_own_public_profile(
    '検証オーナー', NULL, NULL, NULL, NULL, 'ギフト交換歓迎', true);

  RESET ROLE;
  SELECT count(*) INTO n
  FROM public.app_user
  WHERE id = owner_app
    AND pokemon_go_friend_open = false
    AND pokemon_go_friend_code IS NULL
    AND pokemon_go_friend_note IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION '[12] コードを消しても募集スイッチや一言が残っている';
  END IF;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.visit WHERE id IN (pub_visit, priv_visit);
  DELETE FROM public.app_user WHERE id IN (owner_app, other_app, quiet_app);
  DELETE FROM auth.users WHERE id IN (owner_id, other_id, quiet_id);

  RAISE NOTICE 'verify-app-user-visibility: 全項目合格。検証行は削除した。';
END $$;
