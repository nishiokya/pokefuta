-- get_own_design_manholes() を、ローカルスタックで実際に呼んで確認する（verify-design-manhole-trigger.sql と同じ流儀）。
--
--   1. 本人の needs_review が返る（近接トリガで needs_review になった投稿）
--   2. 他人の投稿は返らない
--   3. 隠しただけの hidden は返らない／公式の訪問記録へ移した hidden は moved_manhole_id 付きで返る
--   4. anon は実行できない
--
-- 全体が1つの DO ブロック = 1トランザクション。どれか1つでも期待と違えば EXCEPTION で落ちる。検証行は最後に消す。
-- 検証用の2人目のユーザーは auth.users に作って、最後に消す。

DO $$
DECLARE
  v_me uuid;
  v_other uuid := gen_random_uuid();
  v_manhole_id integer;
  v_lat double precision;
  v_lon double precision;
  v_mine uuid;
  v_theirs uuid;
  v_hidden uuid;
  v_moved uuid;
  v_visit uuid;
  v_n integer;
  r record;
BEGIN
  SELECT id INTO v_me FROM auth.users LIMIT 1;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'auth.users が空。ローカルスタックにユーザーを用意すること';
  END IF;
  INSERT INTO auth.users (id) VALUES (v_other);

  SELECT m.id,
         extensions.ST_Y(m.location::extensions.geometry),
         extensions.ST_X(m.location::extensions.geometry)
    INTO v_manhole_id, v_lat, v_lon
  FROM public.manhole AS m
  WHERE m.is_active AND m.location IS NOT NULL
  ORDER BY m.id
  LIMIT 1;
  IF v_manhole_id IS NULL THEN
    RAISE EXCEPTION 'manhole に有効な座標が無い。seed を確認すること';
  END IF;

  -- 所有者権限で投稿を作る。公式の近く（50m以内）の published はトリガで needs_review になる
  INSERT INTO public.design_manhole (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES (v_lat, v_lon, 'photos/design/original/verify-own-mine.jpg', 'image/jpeg', 'published', v_me)
  RETURNING id INTO v_mine;
  INSERT INTO public.design_manhole (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES (v_lat, v_lon, 'photos/design/original/verify-own-theirs.jpg', 'image/jpeg', 'published', v_other)
  RETURNING id INTO v_theirs;
  INSERT INTO public.design_manhole (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES (24.000000, 153.900000, 'photos/design/original/verify-own-hidden.jpg', 'image/jpeg', 'hidden', v_me)
  RETURNING id INTO v_hidden;
  INSERT INTO public.design_manhole (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES (24.000000, 153.900000, 'photos/design/original/verify-own-moved.jpg', 'image/jpeg', 'hidden', v_me)
  RETURNING id INTO v_moved;

  -- 移した投稿: 同じ storage_key の photo が本人の visit に付いている
  INSERT INTO public.visit (user_id, manhole_id, shot_at) VALUES (v_me, v_manhole_id, now()) RETURNING id INTO v_visit;
  INSERT INTO public.photo (visit_id, manhole_id, storage_key) VALUES (v_visit, v_manhole_id, 'photos/design/original/verify-own-moved.jpg');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_me::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. 本人の needs_review が返る
  SELECT * INTO r FROM public.get_own_design_manholes() WHERE id = v_mine;
  IF r.id IS NULL OR r.status <> 'needs_review' OR r.moved_manhole_id IS NOT NULL THEN
    RAISE EXCEPTION '本人の needs_review が返らない: %', r;
  END IF;
  RAISE NOTICE '1. 本人の needs_review → 返る  OK';

  -- 2. 他人の行は返らない
  SELECT count(*) INTO v_n FROM public.get_own_design_manholes() WHERE id = v_theirs;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '他人の投稿が返った';
  END IF;
  RAISE NOTICE '2. 他人の投稿 → 返らない  OK';

  -- 3. 隠しただけの hidden は返らず、移した hidden は moved_manhole_id 付きで返る
  SELECT count(*) INTO v_n FROM public.get_own_design_manholes() WHERE id = v_hidden;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '移していない hidden が返った';
  END IF;
  SELECT * INTO r FROM public.get_own_design_manholes() WHERE id = v_moved;
  IF r.id IS NULL OR r.status <> 'hidden' OR r.moved_manhole_id IS DISTINCT FROM v_manhole_id THEN
    RAISE EXCEPTION '移した hidden が moved_manhole_id 付きで返らない: %', r;
  END IF;
  RAISE NOTICE '3. 隠しただけの hidden → 返らない／移した hidden → moved_manhole_id 付きで返る  OK';

  -- 4. anon は実行できない
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM * FROM public.get_own_design_manholes();
    RAISE EXCEPTION 'anon が get_own_design_manholes() を実行できた';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '4. anon → 実行できない  OK';
  END;
  RESET ROLE;

  DELETE FROM public.photo WHERE visit_id = v_visit;
  DELETE FROM public.visit WHERE id = v_visit;
  DELETE FROM public.design_manhole WHERE id IN (v_mine, v_theirs, v_hidden, v_moved);
  DELETE FROM auth.users WHERE id = v_other;
  RAISE NOTICE '検証行を削除した。';
END;
$$;
