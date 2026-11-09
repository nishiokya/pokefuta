-- デザインマンホールとして投稿された新しいポケふた 8 件を、公式の番号の訪問（visit + photo）へ移す。
--
-- 2026-11-09。公式 local.pokemon.jp が 10/31〜11/8 に止まっていた間、新しく設置されたポケふたは
-- 写真館の manhole に無く、デザインふた投稿（kind = 'pokefuta'、#412）で受けていた。
-- 公式が戻って 491〜498 が載り、manhole にも入った（20261110090000）ので、公式の番号へ移す。
-- 図鑑では仮番号 9001〜9007 として出していた投稿（tracker #851 で official_id を付けた）。
--
--   投稿（design_manhole）                    → 公式    撮影位置と公式の位置の差
--   a0326912 芸西                              → 493     1m
--   202ff606 渋川                              → 498     8m
--   66839dc4 沼田                              → 496     16m
--   7747f7da 四万十                            → 492     3m
--   7bf78a32 佐川                              → 495     1m
--   afb5e0bf 土佐                              → 491     8m
--   91f132e4 いの                              → 494     2m
--   e5efc241 芸西（別の投稿者）                → 493     4m
--
-- 1 件ごとに、投稿者の visit を 1 件と photo を 1 件作り、デザインふた投稿は hidden にする。
--   * visit.shot_at は EXIF の撮影時刻、shot_location は投稿の緯度経度（GPS 必須の投稿なので location_source = 'gps'）
--   * visit.comment は投稿の説明文（空なら NULL）。題名は移さない
--   * visit.created_at / photo.created_at は投稿の日時（新着の並びを投稿したときの位置に保つ）
--   * 画像は動かさない。デザインふたの画像キーをそのまま photo.storage_key にする
--     （小さい WebP は photos/design/small/ にある。deriveSmallKey がそれを引く）
--   * デザインふた投稿を消さずに hidden にする（投稿者本人には見えたまま。#450 と同じ）
--
-- ユーザーは公開ID（app_user.id）で確かめ、auth UID はこのファイルに書かない。
-- 投稿の中身（投稿者・kind・画像キー・撮影時刻）が期待どおりのときだけ動く。移し済みの行は数えるだけ。
-- 投稿者がその蓋の visit をすでに持っている・投稿が想定外の状態なら、全体を止める（何も書かない）。
--
-- ロールバック（移した photo と、それだけを持つ visit を消し、投稿を published に戻す）:
--   WITH d AS (SELECT id, storage_key FROM public.design_manhole WHERE id IN (
--          'a0326912-b668-41ee-9a63-c82fedb54136', '202ff606-b1b7-4b9b-bba2-de3092a16a6d',
--          '66839dc4-9b07-47a7-bfdc-40e5f6f67e5b', '7747f7da-bc6f-4bd4-949f-94f5467d8c21',
--          '7bf78a32-bbcc-4592-86da-7f2948d689fc', 'afb5e0bf-5259-427d-86f0-9d51534a6229',
--          '91f132e4-c923-4b66-ae79-a34f89af638b', 'e5efc241-d01d-4024-9667-3c33c23173f4')),
--        p AS (DELETE FROM public.photo WHERE storage_key IN (SELECT storage_key FROM d) RETURNING visit_id),
--        v AS (DELETE FROM public.visit WHERE id IN (SELECT visit_id FROM p) RETURNING id)
--   UPDATE public.design_manhole SET status = 'published' WHERE id IN (SELECT id FROM d);
--   ※移したあとに付いたいいね・コメントは visit と一緒に消える
DO $$
DECLARE
  t record;
  d public.design_manhole%ROWTYPE;
  v_uid uuid;
  v_visit uuid;
  v_moved integer := 0;
  v_already integer := 0;
  v_n integer;
BEGIN
  -- 本番のデータを移すだけの作業。8 件の投稿が 1 件も無い DB（ローカルの db reset など）では何もしない。
  -- 1 件でもあれば、下の検査をすべて通す（一部だけ欠けているのは想定外なので止まる）
  IF NOT EXISTS (SELECT 1 FROM public.design_manhole WHERE id IN (
       'a0326912-b668-41ee-9a63-c82fedb54136', '202ff606-b1b7-4b9b-bba2-de3092a16a6d',
       '66839dc4-9b07-47a7-bfdc-40e5f6f67e5b', '7747f7da-bc6f-4bd4-949f-94f5467d8c21',
       '7bf78a32-bbcc-4592-86da-7f2948d689fc', 'afb5e0bf-5259-427d-86f0-9d51534a6229',
       '91f132e4-c923-4b66-ae79-a34f89af638b', 'e5efc241-d01d-4024-9667-3c33c23173f4')) THEN
    RAISE NOTICE 'link design posts: 対象の投稿が無い DB なので何もしない';
    RETURN;
  END IF;

  FOR t IN
    SELECT * FROM (VALUES
      -- 投稿, 投稿者の公開ID, 公式の番号, 撮影時刻（EXIF）
      ('a0326912-b668-41ee-9a63-c82fedb54136'::uuid, '6dd0be74-637b-4cca-806f-c98a61f6bc34'::uuid, 493, '2026-11-03 00:09:21+00'::timestamptz),
      ('202ff606-b1b7-4b9b-bba2-de3092a16a6d', 'd371f96b-7e09-4d36-b998-2368d96365e8', 498, '2026-11-06 09:26:05+00'),
      ('66839dc4-9b07-47a7-bfdc-40e5f6f67e5b', '3361a418-56d6-43b7-b3bf-dc09398dc18c', 496, '2026-11-07 06:02:49+00'),
      ('7747f7da-bc6f-4bd4-949f-94f5467d8c21', 'c713e125-557a-4c70-a59c-db840c53eed0', 492, '2026-11-01 03:02:53+00'),
      ('7bf78a32-bbcc-4592-86da-7f2948d689fc', 'c713e125-557a-4c70-a59c-db840c53eed0', 495, '2026-11-01 00:18:34+00'),
      ('afb5e0bf-5259-427d-86f0-9d51534a6229', 'c713e125-557a-4c70-a59c-db840c53eed0', 491, '2026-10-31 23:39:00+00'),
      ('91f132e4-c923-4b66-ae79-a34f89af638b', 'c713e125-557a-4c70-a59c-db840c53eed0', 494, '2026-10-31 23:19:53+00'),
      ('e5efc241-d01d-4024-9667-3c33c23173f4', 'c713e125-557a-4c70-a59c-db840c53eed0', 493, '2026-10-31 22:18:27+00')
    ) AS x(design_id, user_public_id, manhole_id, shot_at)
  LOOP
    SELECT auth_uid INTO v_uid FROM public.app_user WHERE id = t.user_public_id;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'app_user not found: %', t.user_public_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.manhole WHERE id = t.manhole_id) THEN
      RAISE EXCEPTION 'manhole % が無い（20261110090000 を先に当てる）', t.manhole_id;
    END IF;

    SELECT * INTO d FROM public.design_manhole WHERE id = t.design_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design_manhole % が無い', t.design_id;
    END IF;
    IF d.created_by <> v_uid OR d.kind <> 'pokefuta'
       OR (d.exif->>'DateTimeOriginal')::timestamptz IS DISTINCT FROM t.shot_at THEN
      RAISE EXCEPTION 'design_manhole % が期待と違う（移さずに止める）', t.design_id;
    END IF;

    -- 移し済み: 同じ画像キーの photo が、同じ投稿者・同じ蓋の visit に付いている
    IF EXISTS (SELECT 1 FROM public.photo AS p JOIN public.visit AS v ON v.id = p.visit_id
               WHERE p.storage_key = d.storage_key AND p.manhole_id = t.manhole_id
                 AND v.user_id = v_uid AND v.manhole_id = t.manhole_id) THEN
      IF d.status <> 'hidden' THEN
        RAISE EXCEPTION 'design_manhole % は移し済みなのに hidden でない', t.design_id;
      END IF;
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    IF d.status <> 'published' THEN
      RAISE EXCEPTION 'design_manhole % の status が %（published のはず）', t.design_id, d.status;
    END IF;
    IF EXISTS (SELECT 1 FROM public.photo WHERE storage_key = d.storage_key) THEN
      RAISE EXCEPTION '画像キー % がすでに別の photo で使われている', d.storage_key;
    END IF;
    -- 投稿者がこの蓋の visit をすでに持っているなら、重複を作らずに止めて人が決める
    IF EXISTS (SELECT 1 FROM public.visit WHERE user_id = v_uid AND manhole_id = t.manhole_id) THEN
      RAISE EXCEPTION '投稿者 % は manhole % の visit をすでに持っている（止める）', t.user_public_id, t.manhole_id;
    END IF;

    INSERT INTO public.visit (user_id, manhole_id, shot_at, shot_location, comment, is_public, created_at, updated_at)
    VALUES (v_uid, t.manhole_id, t.shot_at,
            extensions.st_setsrid(extensions.st_makepoint(d.longitude, d.latitude), 4326)::extensions.geography,
            nullif(btrim(coalesce(d.description, '')), ''), true, d.created_at, now())
    RETURNING id INTO v_visit;

    INSERT INTO public.photo (visit_id, manhole_id, storage_key, file_size, content_type, width, height, exif, created_at)
    VALUES (v_visit, t.manhole_id, d.storage_key, d.file_size, d.content_type, d.width, d.height, d.exif, d.created_at);

    UPDATE public.design_manhole SET status = 'hidden' WHERE id = t.design_id AND status = 'published';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'design_manhole % を hidden にできなかった', t.design_id;
    END IF;
    v_moved := v_moved + 1;
  END LOOP;

  IF v_moved + v_already <> 8 THEN
    RAISE EXCEPTION '移した % 件 + 移し済み % 件（8 件のはず）', v_moved, v_already;
  END IF;
  RAISE NOTICE 'link design posts: moved %, already %', v_moved, v_already;
END
$$;
