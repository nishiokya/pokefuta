-- photo_scorer（k11 の自動採点ジョブ専用ロール）の権限と scoring 関数の挙動を、
-- ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20260926120000_photo_scorer_role.sql
--
-- このロールの要は「関数を呼べる」ことより「それ以外は何もできない」こと。
-- 前半（[1]〜[4]）は権限の棚卸し、後半（[5]〜）は関数の挙動と入力検査。
-- 検証のために postgres へ一時的に photo_scorer の SET を付与する（SET ROLE のため）。
-- 単一の DO 文なので、途中で落ちればメンバーシップも検証行も巻き戻る。

DO $$
DECLARE
  r pg_roles%ROWTYPE;
  bad text;
  was_member boolean;
  m bigint;
  pid uuid := '00000000-0000-0000-0000-0000000fd001';
  n int;
  ts timestamptz;
  ev text;
  qs real;
  ok boolean;
  ver text;
  f_unscored regprocedure := 'scoring.unscored_photos(text,integer)'::regprocedure;
  f_apply regprocedure := 'scoring.apply_photo_scores(text,timestamptz,jsonb)'::regprocedure;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'photo_scorer';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'photo_scorer が無い。supabase db reset でマイグレーションを流すこと';
  END IF;

  -- ---------------------------------------------------------------------
  -- 1. ロールの属性とメンバーシップ
  -- ---------------------------------------------------------------------
  IF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
     OR NOT r.rolcanlogin OR r.rolinherit OR r.rolconnlimit <> 2 THEN
    RAISE EXCEPTION '[1] photo_scorer の属性が想定と違う（super=%, createrole=%, createdb=%, bypassrls=%, replication=%, login=%, inherit=%, connlimit=%）',
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication, r.rolcanlogin, r.rolinherit, r.rolconnlimit;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'photo_scorer'::regrole) THEN
    RAISE EXCEPTION '[1] photo_scorer が他のロールのメンバーになっている';
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. 届くテーブル・ビュー・列が1つも無い（全スキーマ）
  --    「届く」＝スキーマの USAGE があり、かつ表か列の権限がある。extensions の
  --    postgis / pg_stat_statements は PUBLIC に SELECT があるが、スキーマに入れないので届かない。
  --
  --    net（pg_net）だけは外す。ローカルの Supabase には入っていて、net の表が PUBLIC に
  --    全権限で開いている（＝ログインできるロールは DB から HTTP を出せる）。
  --    2026-09-26 時点で本番には pg_net が無い。本番で有効にするなら先に net の PUBLIC 権限を
  --    剥がすこと（CLAUDE.md）。本番適用後の確認でも pg_net が無いことを見る。
  -- ---------------------------------------------------------------------
  SELECT string_agg(c.oid::regclass::text, ', ') INTO bad
  FROM pg_class AS c
  JOIN pg_namespace AS ns ON ns.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'v', 'm', 'p', 'f')
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema', 'net')
    AND has_schema_privilege('photo_scorer', ns.oid, 'USAGE')
    AND (has_table_privilege('photo_scorer', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         OR has_any_column_privilege('photo_scorer', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[2] photo_scorer が届くテーブル・ビューがある: %', bad;
  END IF;

  -- ---------------------------------------------------------------------
  -- 3. anon より多く実行できる SECURITY DEFINER 関数は scoring の2つだけ
  --    PUBLIC に EXECUTE がある関数はログインロールなら誰でも呼べる（PostgreSQL の既定）。
  --    それ自体は anon と同じなので許し、「anon には無いのに photo_scorer にはある」を見る。
  -- ---------------------------------------------------------------------
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO bad
  FROM pg_proc AS p
  JOIN pg_namespace AS ns ON ns.oid = p.pronamespace
  WHERE p.prosecdef
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema', 'net')   -- net は [2] の注記を参照
    AND has_schema_privilege('photo_scorer', ns.oid, 'USAGE')
    AND has_function_privilege('photo_scorer', p.oid, 'EXECUTE')
    AND NOT (has_schema_privilege('anon', ns.oid, 'USAGE') AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    AND p.oid NOT IN (f_unscored, f_apply);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[3] photo_scorer だけが呼べる SECURITY DEFINER 関数が増えている: %', bad;
  END IF;

  -- ---------------------------------------------------------------------
  -- 4. scoring スキーマ: 所有者、API のロールからの遮断、将来の関数が PUBLIC に開かないこと
  -- ---------------------------------------------------------------------
  IF (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'scoring') <> 'postgres' THEN
    RAISE EXCEPTION '[4] scoring の所有者が postgres でない';
  END IF;
  IF has_schema_privilege('anon', 'scoring', 'USAGE') OR has_schema_privilege('authenticated', 'scoring', 'USAGE') THEN
    RAISE EXCEPTION '[4] anon / authenticated が scoring の USAGE を持っている';
  END IF;
  IF has_function_privilege('anon', f_apply, 'EXECUTE') OR has_function_privilege('authenticated', f_apply, 'EXECUTE')
     OR has_function_privilege('anon', f_unscored, 'EXECUTE') OR has_function_privilege('authenticated', f_unscored, 'EXECUTE') THEN
    RAISE EXCEPTION '[4] anon / authenticated が scoring の関数の EXECUTE を持っている';
  END IF;
  -- [3] の網が効いていること: REVOKE を書き忘れた SECURITY DEFINER 関数を scoring に足すと、
  -- 同じ条件で検出される（scoring に関数を足すときの書き忘れを想定。マイグレーションの注記を参照）
  CREATE FUNCTION scoring._verify_forgot_revoke() RETURNS integer
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT 1';
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS ns ON ns.oid = p.pronamespace
    WHERE p.oid = 'scoring._verify_forgot_revoke()'::regprocedure
      AND p.prosecdef
      AND has_schema_privilege('photo_scorer', ns.oid, 'USAGE')
      AND has_function_privilege('photo_scorer', p.oid, 'EXECUTE')
      AND NOT (has_schema_privilege('anon', ns.oid, 'USAGE') AND has_function_privilege('anon', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION '[4] REVOKE を忘れた SECURITY DEFINER 関数を [3] が検出できない';
  END IF;
  DROP FUNCTION scoring._verify_forgot_revoke();

  -- ---------------------------------------------------------------------
  -- ここから photo_scorer に切り替えて挙動を見る
  -- ---------------------------------------------------------------------
  SELECT id INTO m FROM public.manhole ORDER BY id LIMIT 1;
  IF m IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;
  INSERT INTO public.photo (id, manhole_id, storage_key) VALUES (pid, m, 'photos/original/verify-scorer.jpg');

  -- ロールを作ったユーザー（PostgreSQL 16 以降）は ADMIN 付きのメンバーだが SET は持たない。
  -- MEMBER ではなく SET で判定し、足りなければ SET 付きで一時的に付与する。
  was_member := pg_has_role(current_user, 'photo_scorer', 'SET');
  IF NOT was_member THEN
    EXECUTE format('GRANT photo_scorer TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  END IF;
  SET LOCAL ROLE photo_scorer;

  -- 5. テーブルは直接読めず、直接書けない
  BEGIN
    PERFORM 1 FROM public.photo LIMIT 1;
    RAISE EXCEPTION '[5] photo_scorer が photo を直接読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM public.visit LIMIT 1;
    RAISE EXCEPTION '[5] photo_scorer が visit を読めた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.photo SET quality_score = 1 WHERE id = pid;
    RAISE EXCEPTION '[5] photo_scorer が photo を直接更新できた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 6. 未採点の一覧に出て、書くと消え、版を上げると再び出る
  SELECT count(*) INTO n FROM scoring.unscored_photos('quality_score/0.2.0') AS u WHERE u.id = pid;
  IF n <> 1 THEN RAISE EXCEPTION '[6] 未採点の写真が一覧に出ない'; END IF;
  SELECT scoring.apply_photo_scores('quality_score/0.2.0', now(), jsonb_build_array(jsonb_build_object(
    'id', pid, 'score', 0.81, 'eligible', true, 'expected_version', null, 'expected_scored_at', null))) INTO n;
  IF n <> 1 THEN RAISE EXCEPTION '[6] 更新行数が % 行', n; END IF;
  SELECT count(*) INTO n FROM scoring.unscored_photos('quality_score/0.2.0') AS u WHERE u.id = pid;
  IF n <> 0 THEN RAISE EXCEPTION '[6] 採点後も一覧に残る'; END IF;
  SELECT count(*) INTO n FROM scoring.unscored_photos('quality_score/0.3.0') AS u WHERE u.id = pid;
  IF n <> 1 THEN RAISE EXCEPTION '[6] 版を上げても対象にならない'; END IF;

  -- 7. 楽観ロック: 未採点の時点で読んだ古いバッチは、採点済みの行を上書きしない
  SELECT scoring.apply_photo_scores('quality_score/0.1.0', now(), jsonb_build_array(jsonb_build_object(
    'id', pid, 'score', 0.1, 'eligible', false, 'expected_version', null, 'expected_scored_at', null))) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '[7] 古いバッチが % 行上書きした', n; END IF;

  -- 8. 楽観ロック: 読んだ値を渡せば新しい版で書け、同じ値を読んでいた別のバッチは
  --    後から上書きできない（1トランザクション内で now() が同じ＝時刻が一致しても）
  SELECT u.quality_score_version, u.quality_scored_at INTO ev, ts
  FROM scoring.unscored_photos('quality_score/0.3.0') AS u WHERE u.id = pid;
  SELECT scoring.apply_photo_scores('quality_score/0.3.0', now(), jsonb_build_array(jsonb_build_object(
    'id', pid, 'score', 0.77, 'eligible', true, 'expected_version', ev, 'expected_scored_at', ts))) INTO n;
  IF n <> 1 THEN RAISE EXCEPTION '[8] 版の更新が % 行', n; END IF;
  SELECT scoring.apply_photo_scores('quality_score/0.2.0', now(), jsonb_build_array(jsonb_build_object(
    'id', pid, 'score', 0.81, 'eligible', true, 'expected_version', ev, 'expected_scored_at', ts))) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '[8] 同じ値を読んでいた別のバッチが % 行上書きした', n; END IF;

  -- 9. 不正な入力は1件も書かずに拒否する（関数の RAISE は raise_exception で返る）
  --    [9] で始まる例外は検査側の失敗なので投げ直す
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(), jsonb_build_array(jsonb_build_object(
      'id', pid, 'score', 1.5, 'eligible', true, 'expected_version', ev, 'expected_scored_at', ts)));
    RAISE EXCEPTION '[9] 範囲外のスコアが通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(), jsonb_build_array(
      jsonb_build_object('id', pid, 'score', 0.5, 'eligible', true, 'expected_version', null, 'expected_scored_at', null),
      jsonb_build_object('id', pid, 'score', 0.6, 'eligible', true, 'expected_version', null, 'expected_scored_at', null)));
    RAISE EXCEPTION '[9] 重複 id が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('drop table', now(), '[]'::jsonb);
    RAISE EXCEPTION '[9] 不正な版が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.' || repeat('9', 100), now(), '[]'::jsonb);
    RAISE EXCEPTION '[9] 長すぎる版が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM 1 FROM scoring.unscored_photos('drop table');
    RAISE EXCEPTION '[9] unscored_photos が不正な版を受けた';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(),
      '[{"id":"00000000-0000-0000-0000-0000000fd001","score":"0.5","eligible":true,"expected_version":null,"expected_scored_at":null}]'::jsonb);
    RAISE EXCEPTION '[9] 文字列の score が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(),
      '[{"id":"00000000-0000-0000-0000-0000000fd001","score":0.5,"eligible":"true","expected_version":null,"expected_scored_at":null}]'::jsonb);
    RAISE EXCEPTION '[9] 文字列の eligible が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(),
      '[{"id":"00000000-0000-0000-0000-0000000fd001","score":0.5,"eligible":true,"expected_version":null,"expected_scored_at":null,"quality_score_version":"x"}]'::jsonb);
    RAISE EXCEPTION '[9] 知らないキーが通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(),
      '[{"id":"00000000-0000-0000-0000-0000000fd001","score":0.5,"eligible":true}]'::jsonb);
    RAISE EXCEPTION '[9] expected_* の無い行が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(), '[1, 2]'::jsonb);
    RAISE EXCEPTION '[9] オブジェクトでない行が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(), '{"id":1}'::jsonb);
    RAISE EXCEPTION '[9] 配列でない p_rows が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(), (
      SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'score', 0.5, 'eligible', true,
                                          'expected_version', null, 'expected_scored_at', null))
      FROM generate_series(1, 5001)));
    RAISE EXCEPTION '[9] 5001 行が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', '-infinity'::timestamptz, '[]'::jsonb);
    RAISE EXCEPTION '[9] 無限の採点時刻が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now() + interval '1 day', '[]'::jsonb);
    RAISE EXCEPTION '[9] 未来の採点時刻が通った';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '[9]%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(),
      '[{"id":"not-a-uuid","score":0.5,"eligible":true,"expected_version":null,"expected_scored_at":null}]'::jsonb);
    RAISE EXCEPTION '[9] 不正な uuid が通った';
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;

  RESET ROLE;

  -- 10. ここまでの書き込み・拒否の結果、値は [8] の1回ぶんだけ
  SELECT quality_score, quality_eligible, quality_score_version INTO qs, ok, ver FROM public.photo WHERE id = pid;
  IF qs IS DISTINCT FROM 0.77::real OR ok IS DISTINCT FROM true OR ver IS DISTINCT FROM 'quality_score/0.3.0' THEN
    RAISE EXCEPTION '[10] 値が期待と違う（%, %, %）', qs, ok, ver;
  END IF;

  -- 11. anon / authenticated は scoring の関数を呼べない
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM scoring.unscored_photos('quality_score/0.2.0');
    RAISE EXCEPTION '[11] anon が scoring.unscored_photos を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(), '[]'::jsonb);
    RAISE EXCEPTION '[11] authenticated が scoring.apply_photo_scores を呼べた';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- 検証行とメンバーシップを残さない
  DELETE FROM public.photo WHERE id = pid;
  IF NOT was_member THEN
    EXECUTE format('REVOKE photo_scorer FROM %I', current_user);
  END IF;

  RAISE NOTICE 'verify-photo-scorer: 全項目合格。検証行とメンバーシップは戻した。';
END $$;
