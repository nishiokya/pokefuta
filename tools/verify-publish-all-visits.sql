-- 非公開訪問の一括公開を、ローカルスタックで実際にロールを切り替えて確認する。
--
-- 期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
-- 対象: POST /api/visits/publish-all（src/app/api/visits/publish-all/route.ts）
--
-- ルートが投げるのは実質この1文:
--   UPDATE visit SET is_public = true, updated_at = now()
--    WHERE user_id = <session.user.id> AND is_public = false
--
-- API 層はセキュリティ境界ではない（anon キーで PostgREST を直接叩ける）ので、
-- 「他人の記録を巻き込まない」ことは RLS の側で担保されている必要がある。
-- ここでは本当にロールを切り替えて、一括 UPDATE の及ぶ範囲を確かめる。

DO $$
DECLARE
  owner_id  uuid := '00000000-0000-0000-0000-00000000ba01';
  other_id  uuid := '00000000-0000-0000-0000-00000000ba02';
  empty_id  uuid := '00000000-0000-0000-0000-00000000ba03';
  o_priv_a  uuid := '00000000-0000-0000-0000-00000000bb01';
  o_priv_b  uuid := '00000000-0000-0000-0000-00000000bb02';
  o_pub     uuid := '00000000-0000-0000-0000-00000000bb03';
  x_priv    uuid := '00000000-0000-0000-0000-00000000bb04';
  target_manhole bigint;
  n int;
  pub_updated_before timestamptz;
  pub_updated_after  timestamptz;
BEGIN
  SELECT id INTO target_manhole FROM public.manhole ORDER BY id LIMIT 1;
  IF target_manhole IS NULL THEN
    RAISE EXCEPTION 'manhole が1件も無い。シードを流してから実行すること';
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'publish-all-owner@example.test', 'x', now(), now(), now()),
         (other_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'publish-all-other@example.test', 'x', now(), now(), now()),
         (empty_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'publish-all-empty@example.test', 'x', now(), now(), now());

  -- owner: 非公開2件 + 公開1件 / other: 非公開1件 / empty: 0件
  INSERT INTO public.visit (id, user_id, manhole_id, shot_at, is_public, updated_at) VALUES
    (o_priv_a, owner_id, target_manhole, now(), false, now() - interval '10 days'),
    (o_priv_b, owner_id, target_manhole, now(), false, now() - interval '10 days'),
    (o_pub,    owner_id, target_manhole, now(), true,  now() - interval '10 days'),
    (x_priv,   other_id, target_manhole, now(), false, now() - interval '10 days');

  SELECT updated_at INTO pub_updated_before FROM public.visit WHERE id = o_pub;

  -- ---------------------------------------------------------------------
  -- 1. 所有者の一括公開は自分の非公開だけを公開にする
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  WITH updated AS (
    UPDATE public.visit
       SET is_public = true, updated_at = now()
     WHERE user_id = owner_id AND is_public = false
     RETURNING id
  )
  SELECT count(*) INTO n FROM updated;

  IF n <> 2 THEN
    RAISE EXCEPTION '[1] 一括公開の件数が想定と違う（期待 2 / 実際 %）', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. 他人の非公開は巻き込まれない
  --    RLS(users_update_own_visits) と user_id の明示指定の二層で守る想定
  -- ---------------------------------------------------------------------
  RESET ROLE;
  SELECT count(*) INTO n FROM public.visit WHERE id = x_priv AND is_public = false;
  IF n <> 1 THEN
    RAISE EXCEPTION '[2] 他人の非公開記録が公開されている。RLS が効いていない';
  END IF;

  -- ---------------------------------------------------------------------
  -- 3. 既に公開済みの行の updated_at は動かない
  --    is_public = false で絞る意味がここ。動くと「最近更新」系の並びが壊れる
  -- ---------------------------------------------------------------------
  SELECT updated_at INTO pub_updated_after FROM public.visit WHERE id = o_pub;
  IF pub_updated_after <> pub_updated_before THEN
    RAISE EXCEPTION '[3] 公開済みの行の updated_at が動いた（% → %）',
      pub_updated_before, pub_updated_after;
  END IF;

  -- ---------------------------------------------------------------------
  -- 4. 他人の user_id を狙って撃っても1行も落ちない
  --    アプリは session.user.id しか渡さないが、境界は RLS 側にあることを確かめる
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  WITH updated AS (
    UPDATE public.visit
       SET is_public = true, updated_at = now()
     WHERE user_id = other_id AND is_public = false
     RETURNING id
  )
  SELECT count(*) INTO n FROM updated;

  IF n <> 0 THEN
    RAISE EXCEPTION '[4] 他人の user_id を指定した一括公開が % 行通った。RLS が素通り', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 5. 非公開が0件のユーザーが実行しても、エラーにならず0行
  --    UI ではボタンを出さないが、API は単独で叩けるので落ちないこと
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', empty_id, 'role', 'authenticated')::text, true);

  WITH updated AS (
    UPDATE public.visit
       SET is_public = true, updated_at = now()
     WHERE user_id = empty_id AND is_public = false
     RETURNING id
  )
  SELECT count(*) INTO n FROM updated;

  IF n <> 0 THEN
    RAISE EXCEPTION '[5] 非公開0件のユーザーで % 行更新された', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 6. 2回目の一括公開は0行（冪等・二度押しで updated_at を焼き直さない）
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  WITH updated AS (
    UPDATE public.visit
       SET is_public = true, updated_at = now()
     WHERE user_id = owner_id AND is_public = false
     RETURNING id
  )
  SELECT count(*) INTO n FROM updated;

  IF n <> 0 THEN
    RAISE EXCEPTION '[6] 2回目の一括公開が % 行通った。冪等でない', n;
  END IF;

  -- ---------------------------------------------------------------------
  -- 7. RETURNING id が権限で落ちない
  --    ルートは .select('id') を使う。visit は列単位 GRANT ではないが、
  --    photo と同じ事故（select=* で 42501）を将来入れないための番人
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.visit WHERE user_id = owner_id AND is_public = true;
  IF n <> 3 THEN
    RAISE EXCEPTION '[7] 所有者の公開件数が想定と違う（期待 3 / 実際 %）', n;
  END IF;

  RESET ROLE;

  -- 検証行を残さない（この DO は単一文なので、途中で落ちれば自動で巻き戻る）
  DELETE FROM public.visit WHERE id IN (o_priv_a, o_priv_b, o_pub, x_priv);
  DELETE FROM auth.users WHERE id IN (owner_id, other_id, empty_id);

  RAISE NOTICE 'verify-publish-all-visits: 全項目合格。検証行は削除した。';
END $$;
