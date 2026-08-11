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
  owner_priv uuid := '00000000-0000-0000-0000-00000000ec03';
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
    -- quiet は公開訪問0件だがフレンド募集は ON。
    -- 「訪問が無いと機能そのものが使えない」退行を検出するための仕掛け。
    (quiet_app, quiet_id, '検証サイレント', '公開訪問が無い人', NULL,              NULL,
     '999988887777', '訪問はまだ無いけど募集中', true);

  INSERT INTO public.visit (id, user_id, manhole_id, shot_at, is_public, note) VALUES
    (pub_visit,  owner_id, target_manhole, now(), true,  'ないしょのメモ'),
    (priv_visit, quiet_id, target_manhole, now(), false, 'ないしょのメモ'),
    -- 公開訪問も持つユーザーの非公開訪問。ビューが is_public だけで正しく切れるか見る
    (owner_priv, owner_id, target_manhole, now(), false, 'ないしょのメモ');

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
  -- 11b. 数字と区切り以外が混ざったコードは保存できない
  --      「数字以外を落として12桁か見る」だけだと `abcd` が空文字になり、
  --      未設定として通って保存済みのコードを消す。打ち間違いで消えるのは
  --      弾かれるより悪いので、落とす前に止める。
  -- ---------------------------------------------------------------------
  BEGIN
    PERFORM public.update_own_public_profile(
      '検証オーナー', NULL, NULL, NULL, 'abcd', NULL, true);
    RAISE EXCEPTION '[11b] 数字を含まない打ち間違いが「未設定」として通ってしまう';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%Invalid Pokemon GO friend code%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  SELECT pokemon_go_friend_code INTO txt FROM public.app_user WHERE id = owner_app;
  IF txt IS DISTINCT FROM '123456789012' THEN
    RAISE EXCEPTION '[11b] 打ち間違いの保存が失敗した後にコードが消えている（%）', txt;
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

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

  -- =====================================================================
  -- 公開プロフィール面の再設計（get_public_profile / public_user_visit_*）
  --
  -- 旧 get_public_user_info() は「公開訪問が1件以上」を返却条件にしており、
  -- その副作用で公開訪問0件のユーザー（本番74人中34人）の公開ページが404だった。
  -- 門は auth_uid を anon へ返す構造の後始末で、原因ではない。
  -- 新経路は auth_uid を返さないので門が要らない。ここではその両方を固定する。
  -- =====================================================================

  RESET ROLE;
  SET LOCAL ROLE anon;

  -- ---------------------------------------------------------------------
  -- 13. 公開訪問0件でも get_public_profile は1行返す（404にならない）
  --     旧 get_public_user_info は今回触らないので、引き続き0行のままであること。
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.get_public_profile(quiet_app);
  IF n <> 1 THEN
    RAISE EXCEPTION '[13] 公開訪問0件のユーザーが get_public_profile から引けない（%行）', n;
  END IF;

  SELECT count(*) INTO n FROM public.get_public_user_info(quiet_app);
  IF n <> 0 THEN
    RAISE EXCEPTION '[13] 旧 get_public_user_info の門が外れている。expand フェーズでは触らない';
  END IF;

  -- ---------------------------------------------------------------------
  -- 14. 訪問0件でも公開中のフレンドコードが返る
  --     「登録直後はフレンド募集が使えない」という退行を防ぐ
  -- ---------------------------------------------------------------------
  SELECT pokemon_go_friend_code INTO txt FROM public.get_public_profile(quiet_app);
  IF txt IS DISTINCT FROM '999988887777' THEN
    RAISE EXCEPTION '[14] 訪問0件のユーザーのトレーナーコードが公開されない（%）', txt;
  END IF;

  -- ---------------------------------------------------------------------
  -- 15. 募集OFFにすると新RPCからもコードが消える
  -- ---------------------------------------------------------------------
  RESET ROLE;
  UPDATE public.app_user SET pokemon_go_friend_open = false WHERE id = quiet_app;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.get_public_profile(quiet_app)
   WHERE pokemon_go_friend_code IS NOT NULL OR pokemon_go_friend_note IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION '[15] 募集OFFなのにコードか一言が返っている';
  END IF;
  RESET ROLE;
  UPDATE public.app_user SET pokemon_go_friend_open = true WHERE id = quiet_app;
  SET LOCAL ROLE anon;

  -- ---------------------------------------------------------------------
  -- 16. ビューは公開訪問だけを返す／非公開訪問は返らない
  --     owner は公開1件・非公開1件を持つ。切り分けられているか。
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.public_user_visit_base WHERE public_user_id = owner_app;
  IF n <> 1 THEN
    RAISE EXCEPTION '[16] owner の公開訪問が1件のはずが %件（非公開が混じっている可能性）', n;
  END IF;

  SELECT count(*) INTO n FROM public.public_user_visit_base
   WHERE id IN (priv_visit, owner_priv);
  IF n <> 0 THEN
    RAISE EXCEPTION '[16] 非公開訪問がビューから読める（%件）', n;
  END IF;

  -- 公開訪問0件のユーザーはビューでも0件。行が消えるだけでプロフィールは引ける
  SELECT count(*) INTO n FROM public.public_user_visit_base WHERE public_user_id = quiet_app;
  IF n <> 0 THEN
    RAISE EXCEPTION '[16] 公開訪問0件のはずのユーザーに訪問が返っている（%件）', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 17. 存在しない公開IDは0行（呼び出し側が notFound() に落とせる）
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.get_public_profile('00000000-0000-0000-0000-0000000000ff');
  IF n <> 0 THEN
    RAISE EXCEPTION '[17] 存在しない公開IDが1行返っている';
  END IF;

  -- ---------------------------------------------------------------------
  -- 18. 新経路のどこにも auth_uid が出ない
  --     返り値の列名で見る。「レビューで気をつける」ではなく機械で固定する。
  -- ---------------------------------------------------------------------
  RESET ROLE;
  IF pg_get_function_result('public.get_public_profile(uuid)'::regprocedure) ILIKE '%auth_uid%' THEN
    RAISE EXCEPTION '[18] get_public_profile が auth_uid を返している';
  END IF;

  -- ---------------------------------------------------------------------
  -- 19. ビューの列集合を固定する
  --     所有者権限で走るビューは、列を1つ足すだけで公開面が広がる。
  --     photo.exif が漏れたのと同じ形なので、増減したらここで落とす。
  --     **落ちたときに直すのはこの検査ではなく、その列を公開してよいかの判断。**
  -- ---------------------------------------------------------------------
  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO txt
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'public_user_visit_base';
  IF txt <> 'comment,created_at,id,manhole_id,manhole_municipality,manhole_pokemons,'
            'manhole_prefecture,manhole_title,public_user_id,shot_at' THEN
    RAISE EXCEPTION '[19] public_user_visit_base の列集合が変わった: %', txt;
  END IF;

  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO txt
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'public_user_visit_card';
  IF txt <> 'comment,created_at,id,latest_photo_id,manhole_id,manhole_municipality,'
            'manhole_pokemons,manhole_prefecture,manhole_title,public_user_id,shot_at' THEN
    RAISE EXCEPTION '[19] public_user_visit_card の列集合が変わった: %', txt;
  END IF;

  -- 名指しで「これは絶対に出さない」も見る。列集合検査を機械的に更新されても止まるように
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('public_user_visit_base', 'public_user_visit_card')
     AND column_name IN ('auth_uid', 'user_id', 'note', 'shot_location', 'exif');
  IF n <> 0 THEN
    RAISE EXCEPTION '[19] ビューに出してはいけない列が入っている（%個）', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 20. 既存の訪問ありユーザーが退行しない
  --     旧方式（auth_uid で visit を直接引く）とビュー経由で件数が一致すること。
  --     ビューへの置換は「動くが数字が変わる」失敗をするので、突き合わせる。
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.visit v
   WHERE v.user_id = owner_id AND v.is_public = true;
  IF n <> (SELECT count(*) FROM public.public_user_visit_base WHERE public_user_id = owner_app) THEN
    RAISE EXCEPTION '[20] 旧方式とビューで公開訪問の件数が違う';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  RESET ROLE;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.visit WHERE id IN (pub_visit, priv_visit, owner_priv);
  DELETE FROM public.app_user WHERE id IN (owner_app, other_app, quiet_app);
  DELETE FROM auth.users WHERE id IN (owner_id, other_id, quiet_id);

  RAISE NOTICE 'verify-app-user-visibility: 全項目合格。検証行は削除した。';
END $$;
