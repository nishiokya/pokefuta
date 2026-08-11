-- photo の公開面を、ローカルスタックで実際に読み書きして確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- マイグレーション: supabase/migrations/20260810120000_restrict_photo_exif_and_private_rows.sql
--
-- 背景: 2026-08-10 まで photo は
--   - テーブル単位の GRANT SELECT（列ごとのACL無し）
--   - RLS の SELECT が USING (true)
-- だったため、非公開訪問の写真行と exif（端末名を含む）が anon から読めていた。

DO $$
DECLARE
  owner_id  uuid := '00000000-0000-0000-0000-00000000fa01';
  other_id  uuid := '00000000-0000-0000-0000-00000000fa02';
  priv_visit uuid := '00000000-0000-0000-0000-00000000fb01';
  pub_visit  uuid := '00000000-0000-0000-0000-00000000fb02';
  priv_photo uuid := '00000000-0000-0000-0000-00000000fc01';
  pub_photo  uuid := '00000000-0000-0000-0000-00000000fc02';
  target_manhole bigint;
  n int;
  new_id uuid;
BEGIN
  SELECT id INTO target_manhole FROM public.manhole ORDER BY id LIMIT 1;
  IF target_manhole IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'photo-visibility-owner@example.test', 'x', now(), now(), now()),
         (other_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'photo-visibility-other@example.test', 'x', now(), now(), now());

  INSERT INTO public.visit (id, user_id, manhole_id, shot_at, is_public) VALUES
    (priv_visit, owner_id, target_manhole, now(), false),
    (pub_visit,  owner_id, target_manhole, now(), true);

  INSERT INTO public.photo (id, visit_id, manhole_id, storage_key, exif) VALUES
    (priv_photo, priv_visit, target_manhole, 'photos/original/verify-private.jpg',
     '{"raw":{"HostComputer":"verify device"}}'::jsonb),
    (pub_photo,  pub_visit,  target_manhole, 'photos/original/verify-public.jpg',
     '{"raw":{"HostComputer":"verify device"}}'::jsonb);

  -- ---------------------------------------------------------------------
  -- 1. anon は非公開訪問の写真行を読めない
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.photo WHERE id = priv_photo;
  IF n <> 0 THEN
    RAISE EXCEPTION '[1] anon が非公開写真を読めている（% 行）', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. anon は公開訪問の写真行を読める（過剰に絞っていない）
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.photo WHERE id = pub_photo;
  IF n <> 1 THEN
    RAISE EXCEPTION '[2] anon が公開写真を読めない（% 行）。配信が壊れる', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 3. anon は exif を読めない（列権限）
  --    公開写真であっても端末名などを見せない
  -- ---------------------------------------------------------------------
  BEGIN
    PERFORM exif FROM public.photo WHERE id = pub_photo;
    RAISE EXCEPTION '[3] anon が exif を読めている。列権限が外れている';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- 期待どおり
  END;

  RESET ROLE;

  -- ---------------------------------------------------------------------
  -- 4. 所有者は自分の非公開写真を読める
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.photo WHERE id = priv_photo;
  IF n <> 1 THEN
    RAISE EXCEPTION '[4] 所有者が自分の非公開写真を読めない（% 行）', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 5. 他人は非公開写真を読めない
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', other_id, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.photo WHERE id = priv_photo;
  IF n <> 0 THEN
    RAISE EXCEPTION '[5] 他人が非公開写真を読めている（% 行）', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 6. INSERT の RETURNING が権限で落ちない
  --    引数なしの .select() は `select=*` になり exif を要求して 42501 で落ちる。
  --    実際に 2026-08-10 の修正前はここで写真投稿が壊れる状態だった。
  --    アプリは .select('id') を使う。ここでは「id を返す INSERT が通る」ことを担保する。
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  INSERT INTO public.photo (visit_id, manhole_id, storage_key)
  VALUES (pub_visit, target_manhole, 'photos/original/verify-returning.jpg')
  RETURNING id INTO new_id;
  IF new_id IS NULL THEN
    RAISE EXCEPTION '[6] INSERT ... RETURNING id が値を返さない';
  END IF;

  RESET ROLE;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.photo WHERE visit_id IN (priv_visit, pub_visit);
  DELETE FROM public.visit WHERE id IN (priv_visit, pub_visit);
  DELETE FROM auth.users WHERE id IN (owner_id, other_id);

  RAISE NOTICE 'verify-photo-visibility: 全項目合格。検証行は削除した。';
END $$;
