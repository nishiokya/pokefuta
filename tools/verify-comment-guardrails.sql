-- 蓋コメントのガードレールを、ローカルスタックで実際に読み書きして確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20260811150000_manhole_comment_guardrails.sql
--
-- なぜ SQL で書くか: Supabase は anon/authenticated キーで PostgREST を直接叩ける設計なので、
-- **アプリの API 層はセキュリティ境界ではない**。境界は GRANT・RLS・制約・トリガだけ。
-- マイグレーションSQLを正規表現で照合しても「実際に何ができるか」は分からない。

DO $$
DECLARE
  author_id   uuid := '00000000-0000-0000-0000-00000000ca01';
  other_id    uuid := '00000000-0000-0000-0000-00000000ca02';
  commenter   uuid := '00000000-0000-0000-0000-00000000ca03';
  target_manhole bigint;
  n int;
  i int;
  report_id uuid;
  new_comment uuid;
  ok boolean;
BEGIN
  SELECT id INTO target_manhole FROM public.manhole ORDER BY id LIMIT 1;
  IF target_manhole IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (author_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'comment-guard-author@example.test', 'x', now(), now(), now()),
         (other_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'comment-guard-other@example.test', 'x', now(), now(), now()),
         (commenter,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'comment-guard-commenter@example.test', 'x', now(), now(), now());

  INSERT INTO public.app_user (auth_uid, display_name)
  VALUES (commenter, 'コメントだけの人');

  -- =====================================================================
  -- 1. 1000文字を超える本文は入らない
  --    これまで制限は API 層だけで、PostgREST 直叩きで巨大コメントを入れて
  --    その蓋のページを全員に対して壊せる状態だった。
  -- =====================================================================
  BEGIN
    INSERT INTO public.manhole_comment (manhole_id, user_id, content)
    VALUES (target_manhole, author_id, repeat('あ', 1001));
    RAISE EXCEPTION '[1] 1001文字のコメントが入ってしまった。CHECK が効いていない';
  EXCEPTION WHEN check_violation THEN
    NULL; -- 期待どおり
  END;

  -- 1000文字ちょうどは通る（境界で過剰に絞っていないこと）
  INSERT INTO public.manhole_comment (manhole_id, user_id, content)
  VALUES (target_manhole, author_id, repeat('あ', 1000));

  -- =====================================================================
  -- 2. 空白だけの本文は入らない
  --    API 側は trim して弾くが、直叩きは素通りしていた。
  -- =====================================================================
  BEGIN
    INSERT INTO public.manhole_comment (manhole_id, user_id, content)
    VALUES (target_manhole, author_id, '  　 ');
    RAISE EXCEPTION '[2] 空白だけのコメントが入ってしまった';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- =====================================================================
  -- 3. レート制限が効く（1ユーザー1時間10件）
  --    auth.uid() を立てないとトリガが素通しするので、JWT クレームを立てる。
  -- =====================================================================
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', other_id, 'role', 'authenticated')::text, true);

  FOR i IN 1..10 LOOP
    INSERT INTO public.manhole_comment (manhole_id, user_id, content)
    VALUES (target_manhole, other_id, 'rate limit test ' || i);
  END LOOP;

  BEGIN
    INSERT INTO public.manhole_comment (manhole_id, user_id, content)
    VALUES (target_manhole, other_id, 'rate limit test 11');
    RAISE EXCEPTION '[3] 11件目が通ってしまった。レート制限が効いていない';
  EXCEPTION WHEN configuration_limit_exceeded THEN
    NULL; -- ERRCODE 53400
  END;

  -- =====================================================================
  -- 4. service_role はレート制限の対象外
  --    日次同期やバックフィルを止めない。制限したいのは利用者であって運用ではない。
  -- =====================================================================
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO public.manhole_comment (manhole_id, user_id, content)
  VALUES (target_manhole, other_id, '運用からの書き込み（auth.uid() が NULL）');

  -- =====================================================================
  -- 5. 通報は自分の名前でしか作れない
  -- =====================================================================
  INSERT INTO public.manhole_comment (manhole_id, user_id, content)
  VALUES (target_manhole, author_id, '通報対象') RETURNING id INTO new_comment;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', commenter, 'role', 'authenticated')::text, true);

  INSERT INTO public.comment_report (comment_id, reporter_user_id, reason)
  VALUES (new_comment, commenter, '検証');

  -- 通報は書き込み専用。SELECT ポリシーを作っていないので `RETURNING` は落ちる。
  -- アプリ側で `.insert(...).select()` と書くとここで 42501 になる
  -- （photo.exif と同じ形の事故）。落ちることを検査で固定して、書かせないようにする。
  BEGIN
    INSERT INTO public.comment_report (comment_id, reporter_user_id, reason)
    VALUES (new_comment, commenter, 'RETURNING 検証') RETURNING id INTO report_id;
    RAISE EXCEPTION '[5] 通報の INSERT ... RETURNING が通ってしまった。'
                    '通報が読めるようになっている（通報者が晒される）';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- 期待どおり。アプリは .select() を付けないこと
  END;

  BEGIN
    INSERT INTO public.comment_report (comment_id, reporter_user_id, reason)
    VALUES (new_comment, other_id, 'なりすまし通報');
    RAISE EXCEPTION '[5] 他人の名前で通報できてしまった';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- RLS の WITH CHECK で弾かれる
  END;

  -- =====================================================================
  -- 6. 同じ人が同じコメントを二度通報しても1件
  --    連打で滞留件数が膨らむと、読む運用が先に壊れる。
  -- =====================================================================
  BEGIN
    INSERT INTO public.comment_report (comment_id, reporter_user_id, reason)
    VALUES (new_comment, commenter, '二度目');
    RAISE EXCEPTION '[6] 同じ通報が2件入ってしまった';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- =====================================================================
  -- 7. 通報は authenticated からも anon からも読めない
  --    「誰が誰を通報したか」は通報者を晒す情報。読めるのは service_role だけ。
  -- =====================================================================
  BEGIN
    SELECT count(*) INTO n FROM public.comment_report;
    RAISE EXCEPTION '[7] authenticated が通報を読めている（% 行）', n;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.comment_report;
    RAISE EXCEPTION '[7] anon が通報を読めている（% 行）', n;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- =====================================================================
  -- 8. コメントしかしていない人にも公開IDが出る
  --    get_public_display_names は蓋コメント投稿者を含めるのに
  --    get_public_user_ids は「公開visitあり」だけだったため、
  --    **名前は出るのにプロフィールへリンクできない**状態だった。
  -- =====================================================================
  RESET ROLE;
  INSERT INTO public.manhole_comment (manhole_id, user_id, content)
  VALUES (target_manhole, commenter, 'コメントだけする人の発言');

  SELECT count(*) INTO n
  FROM public.get_public_user_ids(ARRAY[commenter]::uuid[]);
  IF n <> 1 THEN
    RAISE EXCEPTION '[8] コメントのみのユーザーに公開IDが返らない（% 行）', n;
  END IF;

  -- 表示名の側と条件が揃っていること（片方だけ変えると非対称が復活する）
  SELECT count(*) INTO n
  FROM public.get_public_display_names(ARRAY[commenter]::uuid[]);
  IF n <> 1 THEN
    RAISE EXCEPTION '[8] 表示名と公開IDの公開条件が揃っていない（表示名 % 行）', n;
  END IF;

  -- =====================================================================
  -- 9. 何もしていない人には公開IDを出さない（過剰に開いていないこと）
  -- =====================================================================
  SELECT count(*) INTO n
  FROM public.get_public_user_ids(ARRAY['00000000-0000-0000-0000-0000000000ff'::uuid]);
  IF n <> 0 THEN
    RAISE EXCEPTION '[9] 存在しない/無活動のユーザーに公開IDが返っている（% 行）', n;
  END IF;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.comment_report WHERE reporter_user_id = commenter;
  DELETE FROM public.manhole_comment WHERE user_id IN (author_id, other_id, commenter);
  DELETE FROM public.app_user WHERE auth_uid = commenter;
  DELETE FROM auth.users WHERE id IN (author_id, other_id, commenter);

  RAISE NOTICE 'verify-comment-guardrails: 全項目合格。検証行は削除した。';
END $$;
