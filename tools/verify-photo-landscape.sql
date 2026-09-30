-- ローカル Supabase 専用。マイグレーション適用後に npm run verify:photo-landscape で実行。
-- 全操作をロールバックする。既存データは変更せず、専用fixtureのみ挿入する。
BEGIN;
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_site_counts()'::regprocedure,
    'public.get_public_prefecture_completion()'::regprocedure
  ] LOOP
    IF has_function_privilege('public', f, 'EXECUTE')
       OR (SELECT proconfig FROM pg_proc WHERE oid = f)
          IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[] THEN
      RAISE EXCEPTION 'SECURITY DEFINER function ACL/search_path mismatch: %', f;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  pub_visit uuid := gen_random_uuid();
  private_visit uuid := gen_random_uuid();
  landscape_photo uuid := gen_random_uuid();
  lid_photo uuid := gen_random_uuid();
  before_counts record;
  after_counts record;
  n bigint;
  flag boolean;
BEGIN
  SELECT * INTO before_counts FROM public.get_site_counts();
  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at)
  VALUES(owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', owner_id::text || '@example.test', 'x', now(), now(), now());
  INSERT INTO public.app_user(auth_uid, display_name)
  VALUES(owner_id, '風景検証ユーザー');
  INSERT INTO public.manhole(id, title, prefecture) VALUES
    (-929001, '風景テスト', '__landscape_test__'),
    (-929002, '非公開テスト', '__landscape_test__');
  INSERT INTO public.visit(id, user_id, manhole_id, shot_at, is_public) VALUES
    (pub_visit, owner_id, -929001, now(), true),
    (private_visit, owner_id, -929002, now(), false);
  INSERT INTO public.photo(id, visit_id, manhole_id, storage_key, is_landscape) VALUES
    (landscape_photo, pub_visit, -929001, 'test/landscape.jpg', true);
  -- 旧クライアントの省略値がfalseであり、非公開の蓋は充足率に入らないこと。
  INSERT INTO public.photo(visit_id, manhole_id, storage_key) VALUES
    (private_visit, -929002, 'test/private-lid.jpg');

  SET LOCAL ROLE anon;
  SELECT is_landscape INTO flag FROM public.photo WHERE id=landscape_photo;
  IF flag IS DISTINCT FROM true THEN RAISE EXCEPTION 'anon cannot read landscape classification'; END IF;
  SELECT count(*) INTO n FROM public.photo WHERE visit_id=private_visit;
  IF n <> 0 THEN RAISE EXCEPTION 'private photo leaked'; END IF;
  SELECT with_photo INTO n FROM public.get_public_prefecture_completion()
    WHERE prefecture='__landscape_test__';
  IF n <> 0 THEN RAISE EXCEPTION 'landscape or private lid counted as coverage'; END IF;
  SELECT * INTO after_counts FROM public.get_site_counts();
  IF after_counts.posts <> before_counts.posts + 2
    OR after_counts.public_posts <> before_counts.public_posts + 1
    OR after_counts.manholes_with_photos <> before_counts.manholes_with_photos THEN
    RAISE EXCEPTION 'site counts mixed landscape posts with lid coverage';
  END IF;
  SELECT latest_photo_is_landscape INTO flag FROM public.public_user_visit_card WHERE id=pub_visit;
  IF flag IS DISTINCT FROM true THEN RAISE EXCEPTION 'public card lost landscape label'; END IF;
  SELECT count(*) INTO n FROM public.public_user_visit_card WHERE id=private_visit;
  IF n <> 0 THEN RAISE EXCEPTION 'private card leaked'; END IF;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',owner_id,'role','authenticated')::text, true);
  INSERT INTO public.photo(id, visit_id, manhole_id, storage_key) VALUES
    (lid_photo, pub_visit, -929001, 'test/lid.jpg');
  SELECT is_landscape INTO flag FROM public.photo WHERE id=lid_photo;
  IF flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'omitted flag is not false'; END IF;
  RESET ROLE;
  -- より新しい風景があっても蓋を代表にする。
  UPDATE public.photo SET created_at=now()+interval '1 day' WHERE id=landscape_photo;
  SET LOCAL ROLE anon;
  SELECT latest_photo_is_landscape INTO flag FROM public.public_user_visit_card WHERE id=pub_visit;
  IF flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'landscape replaced public lid'; END IF;
  SELECT with_photo INTO n FROM public.get_public_prefecture_completion()
    WHERE prefecture='__landscape_test__';
  IF n <> 1 THEN RAISE EXCEPTION 'public lid does not count as coverage'; END IF;
  RESET ROLE;

  UPDATE public.visit SET is_public=false WHERE id=pub_visit;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.public_user_visit_card WHERE id=pub_visit;
  IF n <> 0 THEN RAISE EXCEPTION 'unpublished visit remains public'; END IF;
  SELECT with_photo INTO n FROM public.get_public_prefecture_completion()
    WHERE prefecture='__landscape_test__';
  IF n <> 0 THEN RAISE EXCEPTION 'unpublished lid remains in coverage'; END IF;
  RESET ROLE;
  RAISE NOTICE 'verify-photo-landscape: passed';
END $$;
ROLLBACK;
