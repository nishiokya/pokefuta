-- design_manhole の近接レビュー強制を、実際に INSERT して確認する。
--
-- tests/design-manhole-db-policy.test.ts はマイグレーションSQLを正規表現で
-- 照合するだけで、トリガを一度も実行しない。オブジェクトが存在することと、
-- 実行時に正しく動くことは別物なので、ここで本当に走らせる。
--
-- 確認するのは4点。1〜3は authenticated ロール（＝アプリと同じ権限）で行う。
--   1. 50m以内を published で投稿 → needs_review に書き換わり近接情報が入る
--   2. 50m圏外を published で投稿 → published のまま、近接情報は NULL
--   3. hidden での投稿は RLS に拒否される（利用者が自分で伏せることはできない）
--   4. テーブル所有者が 50m以内へ hidden で投稿 → 近接情報は入るが hidden のまま
--
-- 1 は同時に、**トリガが書き換えた行が後段の RLS WITH CHECK を通る**ことの確認でもある。
-- トリガは published を needs_review へ書き換えるので、ポリシーが published しか
-- 許可していなければここで落ちる。この依存はマイグレーションのコメントにしか
-- 書かれておらず、SQLの字面を見るだけでは検証できない。
--
-- 全体が1つの DO ブロック = 1トランザクション。**どれか1つでも期待と違えば
-- EXCEPTION で落ちる**ので、正常終了したことが全項目の合格を意味する。
-- 検証行は最後に消す。

DO $$
DECLARE
  v_user uuid;
  v_manhole_id integer;
  v_lat double precision;
  v_lon double precision;
  v_near_id uuid;
  v_far_id uuid;
  v_hidden_id uuid;
  r record;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth.users が空。ローカルスタックにユーザーを用意すること';
  END IF;

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

  -- アプリと同じ権限で投稿する。auth.uid() は request.jwt.claims->>'sub' を読む。
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;

  -- 1. 50m以内 / published
  INSERT INTO public.design_manhole
    (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES
    (v_lat, v_lon, 'photos/design/original/verify-near.jpg', 'image/jpeg',
     'published', v_user)
  RETURNING id INTO v_near_id;

  SELECT status, nearby_official_manhole_id, nearby_official_manhole_distance_m,
         nearby_official_manhole_confirmed_at
    INTO r
  FROM public.design_manhole WHERE id = v_near_id;

  IF r.status <> 'needs_review' THEN
    RAISE EXCEPTION '近接投稿が needs_review にならない: status=%', r.status;
  END IF;
  IF r.nearby_official_manhole_id IS DISTINCT FROM v_manhole_id THEN
    RAISE EXCEPTION '近接IDが一致しない: 期待=% 実際=%',
      v_manhole_id, r.nearby_official_manhole_id;
  END IF;
  IF r.nearby_official_manhole_distance_m IS NULL
     OR r.nearby_official_manhole_distance_m > 50 THEN
    RAISE EXCEPTION '距離が範囲外: %', r.nearby_official_manhole_distance_m;
  END IF;
  IF r.nearby_official_manhole_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION '未確認の投稿に confirmed_at が入っている';
  END IF;
  RAISE NOTICE '1. 50m以内/published → needs_review, id=%, %m  OK',
    r.nearby_official_manhole_id, r.nearby_official_manhole_distance_m;

  -- 2. 50m圏外 / published。日本の陸地から十分離れた海上を使う。
  INSERT INTO public.design_manhole
    (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES
    (24.000000, 153.900000, 'photos/design/original/verify-far.jpg', 'image/jpeg',
     'published', v_user)
  RETURNING id INTO v_far_id;

  SELECT status, nearby_official_manhole_id, nearby_official_manhole_distance_m
    INTO r
  FROM public.design_manhole WHERE id = v_far_id;

  IF r.status <> 'published' THEN
    RAISE EXCEPTION '圏外投稿の status が変わっている: %', r.status;
  END IF;
  IF r.nearby_official_manhole_id IS NOT NULL
     OR r.nearby_official_manhole_distance_m IS NOT NULL THEN
    RAISE EXCEPTION '圏外投稿に近接情報が入っている: id=% dist=%',
      r.nearby_official_manhole_id, r.nearby_official_manhole_distance_m;
  END IF;
  RAISE NOTICE '2. 50m圏外/published → published のまま, 近接情報 NULL  OK';

  -- 3. hidden は RLS が拒否する。insert ポリシーは published / needs_review だけを
  --    許可しており、利用者が自分の投稿を最初から伏せることはできない。
  BEGIN
    INSERT INTO public.design_manhole
      (latitude, longitude, storage_key, content_type, status, created_by)
    VALUES
      (v_lat, v_lon, 'photos/design/original/verify-rls.jpg', 'image/jpeg',
       'hidden', v_user);
    RAISE EXCEPTION 'hidden の投稿が RLS を通ってしまった';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '3. hidden/authenticated → RLS が拒否  OK';
  END;

  RESET ROLE;

  -- 4. 所有者権限で hidden を入れ、トリガが status を書き換えないことを見る。
  --    トリガは published のときだけ needs_review へ倒す。
  INSERT INTO public.design_manhole
    (latitude, longitude, storage_key, content_type, status, created_by)
  VALUES
    (v_lat, v_lon, 'photos/design/original/verify-hidden.jpg', 'image/jpeg',
     'hidden', v_user)
  RETURNING id INTO v_hidden_id;

  SELECT status, nearby_official_manhole_id INTO r
  FROM public.design_manhole WHERE id = v_hidden_id;

  IF r.status <> 'hidden' THEN
    RAISE EXCEPTION 'hidden 投稿の status が書き換わった: %', r.status;
  END IF;
  IF r.nearby_official_manhole_id IS NULL THEN
    RAISE EXCEPTION 'hidden 投稿に近接情報が入らない';
  END IF;
  RAISE NOTICE '4. 50m以内/hidden（所有者） → hidden のまま, 近接情報あり  OK';

  DELETE FROM public.design_manhole
  WHERE id IN (v_near_id, v_far_id, v_hidden_id);

  RAISE NOTICE '検証行を削除した。3件すべて期待どおり。';
END;
$$;
