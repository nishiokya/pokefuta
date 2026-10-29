-- visit.location_source（撮影位置の有無の印）を、ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- 対象: supabase/migrations/20261030120000_visit_location_source.sql
--
-- 印は shot_location から自動で決まる生成列。visit は本人なら PostgREST で直接書けるので、
-- 「位置情報なしの投稿が必ず none になる」「本人が印を書き換えられない」
-- 「公開側から印が読めない」を SQL の側で確かめる。

DO $$
DECLARE
  owner_id uuid := '00000000-0000-0000-0000-00000000c101';
  v_gps    uuid := '00000000-0000-0000-0000-00000000c201';
  v_none   uuid := '00000000-0000-0000-0000-00000000c202';
  v_forged uuid := '00000000-0000-0000-0000-00000000c203';
  target_manhole bigint;
  src text;
  n int;
BEGIN
  SELECT id INTO target_manhole FROM public.manhole ORDER BY id LIMIT 1;
  IF target_manhole IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'location-source-owner@example.test', 'x', now(), now(), now());

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------------
  -- 1. 本人の INSERT（アプリと同じ経路）: 位置ありは gps、位置なしは none
  -- ---------------------------------------------------------------------
  INSERT INTO public.visit (id, user_id, manhole_id, shot_at, shot_location) VALUES
    (v_gps,  owner_id, target_manhole, now(),
     extensions.ST_SetSRID(extensions.ST_MakePoint(139.7, 35.7), 4326)::extensions.geography),
    (v_none, owner_id, target_manhole, now(), NULL);

  -- ---------------------------------------------------------------------
  -- 2. 本人が印を直接書こうとしても書けない（生成列）
  -- ---------------------------------------------------------------------
  BEGIN
    INSERT INTO public.visit (id, user_id, manhole_id, shot_at, location_source)
    VALUES (v_forged, owner_id, target_manhole, now(), 'gps');
    RAISE EXCEPTION '[2] location_source を INSERT で指定できてしまった';
  EXCEPTION
    WHEN generated_always THEN NULL;  -- 期待どおり
  END;

  BEGIN
    UPDATE public.visit SET location_source = 'gps' WHERE id = v_none;
    RAISE EXCEPTION '[2] location_source を UPDATE で書き換えられてしまった';
  EXCEPTION
    WHEN generated_always THEN NULL;  -- 期待どおり
  END;

  -- ---------------------------------------------------------------------
  -- 3. 公開側（anon / authenticated）からは印を読めない（列単位 GRANT に入れていない）
  -- ---------------------------------------------------------------------
  BEGIN
    SELECT location_source INTO src FROM public.visit WHERE id = v_none;
    RAISE EXCEPTION '[3] authenticated から location_source が読めてしまった';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- 期待どおり
  END;

  -- 既存の公開列の読み取りは変わらない
  SELECT count(*) INTO n FROM public.visit WHERE id IN (v_gps, v_none);
  IF n <> 2 THEN
    RAISE EXCEPTION '[3] 本人の visit が読めない（期待 2 / 実際 %）', n;
  END IF;

  RESET ROLE;

  -- ---------------------------------------------------------------------
  -- 4. 値の確認（運営の権限で読む）
  -- ---------------------------------------------------------------------
  SELECT location_source INTO src FROM public.visit WHERE id = v_gps;
  IF src IS DISTINCT FROM 'gps' THEN
    RAISE EXCEPTION '[4] 位置ありの visit が gps になっていない（実際 %）', src;
  END IF;
  SELECT location_source INTO src FROM public.visit WHERE id = v_none;
  IF src IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION '[4] 位置なしの visit が none になっていない（実際 %）', src;
  END IF;

  -- ---------------------------------------------------------------------
  -- 5. 本人が撮影位置を消すと none に変わる（あとから gps のふりはできない）
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  UPDATE public.visit SET shot_location = NULL WHERE id = v_gps;
  RESET ROLE;
  SELECT location_source INTO src FROM public.visit WHERE id = v_gps;
  IF src IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION '[5] 撮影位置を消しても none にならない（実際 %）', src;
  END IF;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.visit WHERE id IN (v_gps, v_none, v_forged);
  DELETE FROM auth.users WHERE id = owner_id;

  RAISE NOTICE 'verify-visit-location-source: 全項目合格。検証行は削除した。';
END $$;
