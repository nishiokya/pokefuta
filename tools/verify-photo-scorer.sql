-- photo_scorer（k11 の自動採点ジョブ専用ロール）の権限と scoring 関数の挙動を、
-- ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20260926120000_photo_scorer_role.sql
--
-- このロールの要は「関数を呼べる」ことより「それ以外は何もできない」こと。
-- 前半（[1]〜[3]）は権限の自己点検とその網が効くこと、後半（[5]〜）は関数の挙動と入力検査。
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
  -- 1. 権限の自己点検 scoring.audit_photo_scorer() が違反を返さない
  --    本番で k11 のジョブが書き込みの前に毎回呼ぶのと同じ関数。
  --    ローカルの Supabase には pg_net が入っていて、net の表が PUBLIC に開いている。
  --    これはローカル環境の性質なので、net.* と extension pg_net だけは失敗にせず
  --    警告として出す（本番で同じものが出たらジョブが止まる）。
  -- ---------------------------------------------------------------------
  SELECT string_agg(a.kind || ': ' || a.detail, ', ') INTO bad
  FROM scoring.audit_photo_scorer() AS a
  WHERE NOT (a.kind = 'reachable_relation' AND a.detail LIKE 'net.%')
    AND NOT (a.kind = 'extension' AND a.detail LIKE 'pg_net %');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[1] 権限の自己点検が違反を返した: %', bad;
  END IF;
  SELECT string_agg(a.detail, ', ') INTO bad FROM scoring.audit_photo_scorer() AS a;
  IF bad IS NOT NULL THEN
    RAISE WARNING '[1] ローカルの pg_net により photo_scorer から届くもの（本番ならジョブが止まる）: %', bad;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. 自己点検が効くこと（わざと違反を作って、それぞれ検出されるか）
  --    どれも単一の DO 文の中なので、落ちても成功しても最後に元へ戻す。
  -- ---------------------------------------------------------------------
  -- 2a. 表の権限を付けると reachable_relation
  GRANT SELECT ON public.manhole TO photo_scorer;
  IF NOT EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a
                 WHERE a.kind = 'reachable_relation' AND a.detail = 'public.manhole') THEN
    RAISE EXCEPTION '[2a] 表の権限を付けても自己点検が検出しない';
  END IF;
  REVOKE SELECT ON public.manhole FROM photo_scorer;

  -- 2b. public に SECURITY DEFINER 関数を足して REVOKE を忘れると secdef_function
  --     （anon からも呼べる関数でも検出する。anon との差分では見ない）
  CREATE FUNCTION public._verify_scorer_forgot_revoke() RETURNS integer
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT 1';
  IF NOT EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a
                 WHERE a.kind = 'secdef_function' AND a.detail = 'public._verify_scorer_forgot_revoke()') THEN
    RAISE EXCEPTION '[2b] public の REVOKE 忘れを自己点検が検出しない';
  END IF;
  DROP FUNCTION public._verify_scorer_forgot_revoke();

  -- 2c. scoring に関数を足すと scoring_object（REVOKE を忘れた SECURITY DEFINER なら secdef_function も）
  CREATE FUNCTION scoring._verify_forgot_revoke() RETURNS integer
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT 1';
  IF (SELECT count(*) FROM scoring.audit_photo_scorer() AS a
      WHERE (a.kind = 'scoring_object' AND a.detail = 'function _verify_forgot_revoke')
         OR (a.kind = 'secdef_function' AND a.detail = 'scoring._verify_forgot_revoke()')) <> 2 THEN
    RAISE EXCEPTION '[2c] scoring に足した関数を自己点検が検出しない';
  END IF;
  DROP FUNCTION scoring._verify_forgot_revoke();

  -- 2d. 他ロールが photo_scorer になれると can_become、photo_scorer が他ロールに入ると member_of
  --     （循環するので2方向は別々に作る）
  GRANT photo_scorer TO authenticated WITH SET TRUE;
  IF NOT EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a
                 WHERE a.kind = 'can_become' AND a.detail = 'authenticated') THEN
    RAISE EXCEPTION '[2d] photo_scorer になれるロールを自己点検が検出しない';
  END IF;
  REVOKE photo_scorer FROM authenticated;
  GRANT authenticated TO photo_scorer;
  IF NOT EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a
                 WHERE a.kind = 'member_of' AND a.detail = 'authenticated') THEN
    RAISE EXCEPTION '[2d] photo_scorer が他ロールに入ったことを自己点検が検出しない';
  END IF;
  REVOKE authenticated FROM photo_scorer;

  -- 2e. 属性を強めると role_attribute
  ALTER ROLE photo_scorer BYPASSRLS;
  IF NOT EXISTS (SELECT 1 FROM scoring.audit_photo_scorer() AS a WHERE a.kind = 'role_attribute') THEN
    RAISE EXCEPTION '[2e] BYPASSRLS を自己点検が検出しない';
  END IF;
  ALTER ROLE photo_scorer NOBYPASSRLS;

  -- ---------------------------------------------------------------------
  -- 3. scoring スキーマ: 所有者と、API のロールからの遮断
  -- ---------------------------------------------------------------------
  IF (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'scoring') <> 'postgres' THEN
    RAISE EXCEPTION '[3] scoring の所有者が postgres でない';
  END IF;
  IF has_schema_privilege('anon', 'scoring', 'USAGE') OR has_schema_privilege('authenticated', 'scoring', 'USAGE') THEN
    RAISE EXCEPTION '[3] anon / authenticated が scoring の USAGE を持っている';
  END IF;
  IF has_function_privilege('anon', f_apply, 'EXECUTE') OR has_function_privilege('authenticated', f_apply, 'EXECUTE')
     OR has_function_privilege('anon', f_unscored, 'EXECUTE') OR has_function_privilege('authenticated', f_unscored, 'EXECUTE') THEN
    RAISE EXCEPTION '[3] anon / authenticated が scoring の関数の EXECUTE を持っている';
  END IF;

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

  -- 5. photo_scorer 自身が自己点検を呼べる（本番のジョブはこのロールで呼ぶ）。
  --    テーブルは直接読めず、直接書けない
  PERFORM 1 FROM scoring.audit_photo_scorer();
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
    PERFORM scoring.apply_photo_scores('quality_score/0.2.0', now(), jsonb_build_array(jsonb_build_object(
      'id', pid, 'score', 0.5, 'eligible', true, 'expected_version', repeat('v', 2100000), 'expected_scored_at', null)));
    RAISE EXCEPTION '[9] 2MB を超える p_rows が通った';
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
