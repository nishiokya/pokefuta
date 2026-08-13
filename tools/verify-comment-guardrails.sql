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
  report_id uuid;
  new_comment uuid;
  self_comment uuid;
  public_visit uuid := '00000000-0000-0000-0000-00000000cb01';
  ok boolean;
  -- [9] Phase 1c（蓋コメントの auth uid を DB でも閉じる）で使う
  result_sig text;
  commenter_name text;
  commenter_public_id uuid;
  own_flag boolean;
  rpc_total bigint;
  probe_uid uuid;
  rehearsal_comment uuid;
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
  -- 3. 通報は自分の名前でしか作れない
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
    RAISE EXCEPTION '[3] 通報の INSERT ... RETURNING が通ってしまった。'
                    '通報が読めるようになっている（通報者が晒される）';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- 期待どおり。アプリは .select() を付けないこと
  END;

  BEGIN
    INSERT INTO public.comment_report (comment_id, reporter_user_id, reason)
    VALUES (new_comment, other_id, 'なりすまし通報');
    RAISE EXCEPTION '[3] 他人の名前で通報できてしまった';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- RLS の WITH CHECK で弾かれる
  END;

  -- =====================================================================
  -- 4. 自分のコメントは自分で通報できない
  --    API 側でも弾いているが、authenticated は comment_report に INSERT 権限を
  --    持つので直叩きで迂回できた。「コメントを書く → 自分で通報する」の繰り返しで
  --    運営が読む滞留件数を無限に膨らませられる。
  -- =====================================================================
  RESET ROLE;
  INSERT INTO public.manhole_comment (manhole_id, user_id, content)
  VALUES (target_manhole, commenter, '自分のコメント') RETURNING id INTO self_comment;

  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.comment_report (comment_id, reporter_user_id, reason)
    VALUES (self_comment, commenter, '自作自演');
    RAISE EXCEPTION '[4] 自分のコメントを自分で通報できてしまった';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- RLS の WITH CHECK で弾かれる
  END;

  -- =====================================================================
  -- 5. 同じ人が同じコメントを二度通報しても1件
  --    連打で滞留件数が膨らむと、読む運用が先に壊れる。
  -- =====================================================================
  BEGIN
    INSERT INTO public.comment_report (comment_id, reporter_user_id, reason)
    VALUES (new_comment, commenter, '二度目');
    RAISE EXCEPTION '[5] 同じ通報が2件入ってしまった';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- =====================================================================
  -- 6. 通報は authenticated からも anon からも読めない
  --    「誰が誰を通報したか」は通報者を晒す情報。読めるのは service_role だけ。
  -- =====================================================================
  BEGIN
    SELECT count(*) INTO n FROM public.comment_report;
    RAISE EXCEPTION '[6] authenticated が通報を読めている（% 行）', n;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.comment_report;
    RAISE EXCEPTION '[6] anon が通報を読めている（% 行）', n;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- =====================================================================
  -- 7. コメントしかしていない人にも公開IDが出る
  --    get_public_display_names は蓋コメント投稿者を含めるのに
  --    get_public_user_ids は「公開visitあり」だけだったため、
  --    **名前は出るのにプロフィールへリンクできない**状態だった。
  -- =====================================================================
  RESET ROLE;
  INSERT INTO public.manhole_comment (manhole_id, user_id, content)
  VALUES (target_manhole, commenter, 'コメントだけする人の発言');

  -- **JWT クレームを落としてから測る。**
  -- set_config(..., true) はトランザクション全体に効き、RESET ROLE では消えない。
  -- sub = commenter のまま測ると get_public_display_names の
  -- 「本人には常に自分の名前を返す」分岐で必ず1行返るので、**蓋コメントの分岐を
  -- 削除してもこの検査は通ってしまう**（2026-08-12、レビューで指摘）。
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO n
  FROM public.get_public_user_ids(ARRAY[commenter]::uuid[]);
  IF n <> 1 THEN
    RAISE EXCEPTION '[7] コメントのみのユーザーに公開IDが返らない（% 行）', n;
  END IF;

  -- 表示名の側と条件が揃っていること（片方だけ変えると非対称が復活する）
  SELECT count(*) INTO n
  FROM public.get_public_display_names(ARRAY[commenter]::uuid[]);
  IF n <> 1 THEN
    RAISE EXCEPTION '[7] 表示名と公開IDの公開条件が揃っていない（表示名 % 行）', n;
  END IF;

  -- 公開visitへのコメントしかない人にも、名前と同じ条件で公開IDが出ること。
  -- ここを取りこぼすと「名前は出るのにリンクできない」が別の形で残る。
  INSERT INTO public.visit (id, user_id, manhole_id, is_public, shot_at)
  VALUES (public_visit, author_id, target_manhole, true, now());
  INSERT INTO public.visit_comment (visit_id, user_id, content)
  VALUES (public_visit, other_id, '公開visitへのコメント');
  INSERT INTO public.app_user (auth_uid, display_name)
  VALUES (other_id, 'visitコメントだけの人');

  SELECT count(*) INTO n
  FROM public.get_public_user_ids(ARRAY[other_id]::uuid[]);
  IF n <> 1 THEN
    RAISE EXCEPTION '[7] 公開visitへコメントした人に公開IDが返らない（% 行）', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.get_public_display_names(ARRAY[other_id]::uuid[]);
  IF n <> 1 THEN
    RAISE EXCEPTION '[7] 同じ人の表示名が返らない（% 行）', n;
  END IF;

  -- =====================================================================
  -- 8. 何もしていない人には公開IDを出さない（過剰に開いていないこと）
  -- =====================================================================
  SELECT count(*) INTO n
  FROM public.get_public_user_ids(ARRAY['00000000-0000-0000-0000-0000000000ff'::uuid]);
  IF n <> 0 THEN
    RAISE EXCEPTION '[8] 存在しない/無活動のユーザーに公開IDが返っている（% 行）', n;
  END IF;

  -- =====================================================================
  -- 9. 蓋コメントは auth uid を配らずに読める（Phase 1c）
  --    マイグレーション: 20260813000000_manhole_comment_public_rpc.sql
  --
  --    #215 で蓋コメント欄を482枚すべて未ログインに公開したが、DB 側は
  --    `GRANT ALL TO anon` + `USING (true)` のままで、公開キーで
  --    `manhole_comment?select=user_id` を叩けば投稿者の auth uid が全部取れる。
  --    RPC を足して読み口を差し替え、最後に列を名指しにして塞ぐ3段構え。
  -- =====================================================================
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 9-1. 返り値の型に user_id が無い。**これがこの RPC の存在理由。**
  --      ここに user_id を足すと 1c 全体が無意味になるので、型で固定する。
  SELECT pg_get_function_result(p.oid) INTO result_sig
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'get_manhole_comments';

  IF result_sig IS NULL THEN
    RAISE EXCEPTION '[9] get_manhole_comments が存在しない';
  END IF;
  -- public_user_id は返してよい（公開URL用のID）。auth uid そのものだけを禁じる。
  IF regexp_replace(result_sig, 'public_user_id', '', 'g') ~ 'user_id' THEN
    RAISE EXCEPTION '[9] get_manhole_comments が auth uid を返している: %', result_sig;
  END IF;

  -- 9-2. 未ログイン（anon）から呼べて、表示名と公開IDが解決される。
  --      コメントしかしていない人でも名前が出ること＝[7] と同じ条件に乗っていること。
  SET LOCAL ROLE anon;
  SELECT r.display_name, r.public_user_id, r.is_own, r.thread_total
    INTO commenter_name, commenter_public_id, own_flag, rpc_total
  FROM public.get_manhole_comments(target_manhole::int, 101) r
  WHERE r.content = 'コメントだけする人の発言';

  IF commenter_name IS DISTINCT FROM 'コメントだけの人' THEN
    RAISE EXCEPTION '[9] anon から表示名が解決できない（% ）', coalesce(commenter_name, 'NULL');
  END IF;
  IF commenter_public_id IS NULL THEN
    RAISE EXCEPTION '[9] anon から public_user_id が解決できない（名前は出るのにリンクできない）';
  END IF;
  IF own_flag THEN
    RAISE EXCEPTION '[9] 未ログインなのに is_own が真になっている';
  END IF;

  -- thread_total はカーソルの有無に関係なくスレッド全体の件数。
  SELECT count(*) INTO n FROM public.manhole_comment mc
  WHERE mc.manhole_id = target_manhole AND mc.parent_comment_id IS NULL;
  IF rpc_total <> n THEN
    RAISE EXCEPTION '[9] thread_total が実件数と違う（RPC % / 実 %）', rpc_total, n;
  END IF;

  -- 9-3. 本人が呼べば is_own が真。uid をレスポンスに載せずに判定できていること。
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', commenter, 'role', 'authenticated')::text, true);

  SELECT r.is_own INTO own_flag
  FROM public.get_manhole_comments(target_manhole::int, 101) r
  WHERE r.content = 'コメントだけする人の発言';
  IF NOT own_flag THEN
    RAISE EXCEPTION '[9] 本人が呼んでも is_own が偽（自分のコメントを消せなくなる）';
  END IF;

  -- 9-4. **1c-c の予行演習。** 列を名指しにしても壊れないことを、実際に権限を
  --      張り替えて確かめる。ここが通らないうちは 1c-c を本番に打てない。
  --
  --      列単位の `REVOKE SELECT (user_id)` では塞がらない（テーブル単位の
  --      GRANT ALL が残るため）。photo と同じく table 単位で剥がして名指しで返す。
  RESET ROLE;
  REVOKE SELECT ON public.manhole_comment FROM anon, authenticated;
  GRANT SELECT (id, manhole_id, parent_comment_id, content,
                is_edited, edited_at, created_at, updated_at)
    ON public.manhole_comment TO anon, authenticated;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    SELECT mc.user_id INTO probe_uid FROM public.manhole_comment mc LIMIT 1;
    RAISE EXCEPTION '[9] 列を名指しにしても anon が user_id を読めている';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- 期待どおり
  END;

  -- **`select=*` は落ちる。** PostgREST の `*` は全列に展開されるので、
  -- GRANT していない user_id まで要求して 42501 になる（photo で踏んだのと同じ形）。
  -- 1c-b で MANHOLE_COMMENT_COLUMNS から user_id を外し忘れると本番がこれで死ぬ。
  BEGIN
    PERFORM * FROM public.manhole_comment LIMIT 1;
    RAISE EXCEPTION '[9] user_id を剥がしたのに select * が通ってしまった';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- 肝心の RPC は動き続ける（SECURITY DEFINER なので呼び出し側の列権限に依らない）
  SELECT count(*) INTO n
  FROM public.get_manhole_comments(target_manhole::int, 101);
  IF n = 0 THEN
    RAISE EXCEPTION '[9] 列を名指しにしたら RPC がコメントを返さなくなった';
  END IF;

  -- 投稿と自己削除は RLS のポリシー式が user_id を見る。列を剥がしても
  -- ポリシーが評価できること（＝1c-c で投稿・削除が死なないこと）を確かめる。
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', commenter, 'role', 'authenticated')::text, true);

  INSERT INTO public.manhole_comment (manhole_id, user_id, content)
  VALUES (target_manhole, commenter, '列を名指しにしたあとの投稿')
  RETURNING id INTO rehearsal_comment;

  DELETE FROM public.manhole_comment WHERE id = rehearsal_comment;
  IF EXISTS (SELECT 1 FROM public.manhole_comment mc WHERE mc.id = rehearsal_comment) THEN
    RAISE EXCEPTION '[9] 列を名指しにしたら自分のコメントを削除できなくなった';
  END IF;

  -- 権限を元に戻す（この検査は 1c-c の予行演習であって、適用ではない）。
  RESET ROLE;
  GRANT SELECT ON public.manhole_comment TO anon, authenticated;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.comment_report WHERE reporter_user_id = commenter;
  DELETE FROM public.visit_comment WHERE visit_id = public_visit;
  DELETE FROM public.visit WHERE id = public_visit;
  DELETE FROM public.manhole_comment WHERE user_id IN (author_id, other_id, commenter);
  DELETE FROM public.app_user WHERE auth_uid IN (commenter, other_id);
  DELETE FROM auth.users WHERE id IN (author_id, other_id, commenter);

  RAISE NOTICE 'verify-comment-guardrails: 全項目合格。検証行は削除した。';
END $$;
