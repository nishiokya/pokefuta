-- 別のポケふたとして登録された投稿 8 件を直す（6 件は正しい蓋へ付け替え、2 件は重複なので非公開）。
--
-- 2026-11-07。k11 のポケふた判定（manhole-ai Tools/pokefuta-id、/noloc と /id/posts）で、
-- モデルの1位と登録の蓋が食い違った写真を人が目で見て「モデルが正しい」とした 23 件のうち、
-- 公開のままの 8 件。残る 15 件は非公開で、正しい蓋に同じ写真がある（#429 などで対応済み）。
-- どれも写真が1枚だけの訪問で、写真の図柄が移し先の蓋と同じことを人が確かめた。
--
--   付け替え（visit と photo の両方が manhole_id を持つので両方変える。公開・非公開は変えない）
--     448 → 277、264 → 270、263 → 262、273 → 272、149 → 210、475 → 301
--   非公開（正しい蓋に同じ投稿者の同じ写真が公開で既にある。消さずに隠す）
--     149 の 2 件（正しいのは 150 と 151）
--
-- ひとこと（visit.comment）は 8 件とも空。note はカメラ名と撮影日時の自動入力だけ。
-- いいね・コメント・ブックマークは 0 件。visit / photo に manhole_id を見るトリガは無い。
--
-- ユーザーは公開ID（app_user.id）で確かめ、auth UID はこのファイルに書かない。
-- 行の中身（投稿者・蓋・撮影時刻・写真が1枚だけ）が期待どおりのときだけ動く。すでに直っている行は数えるだけ。
-- どれか1件でも期待とも直った後とも違えば、全体を止める（何も書かない）。
--
-- ロールバック:
--   UPDATE public.visit SET manhole_id = m.from_id FROM (VALUES
--     ('52b5e31b-ca22-4041-b342-afeab9784afd'::uuid, 448), ('1fb48c13-8160-4d1f-bf0b-115bc14ff59c'::uuid, 264),
--     ('8b22ca15-2721-45a9-8ef7-9ef713f2e0a4'::uuid, 263), ('0ba88367-3513-48dc-90a0-cf284a681971'::uuid, 273),
--     ('4025d837-921e-4185-bcba-f36995692d55'::uuid, 149), ('9d5277d2-8ff5-48e8-887a-e3b379ee197e'::uuid, 475)
--   ) AS m(visit_id, from_id) WHERE visit.id = m.visit_id;
--   UPDATE public.photo SET manhole_id = v.manhole_id FROM public.visit AS v
--   WHERE photo.visit_id = v.id AND v.id IN (<上の 6 件>);
--   UPDATE public.visit SET is_public = true
--   WHERE id IN ('680612f1-f7c9-467b-963e-c1673003e46e', '3c1b05ab-7b96-49c1-bf77-2c62c1783fa2');
DO $$
DECLARE
  t record;
  v_uid uuid;
  v_moved integer := 0;
  v_hidden integer := 0;
  v_already integer := 0;
  v_n integer;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      -- action, 投稿者の公開ID, visit, photo, 今の蓋, 正しい蓋, 撮影時刻, 重複の visit（非公開のときだけ）
      ('move', 'b61a47b1-4a0c-41c3-839d-c8d1ac05bd40'::uuid, '52b5e31b-ca22-4041-b342-afeab9784afd'::uuid,
       'c191a3dc-02bf-4536-8f49-04fa27d5ad1b'::uuid, 448, 277, '2026-11-01 04:06:09+00'::timestamptz, NULL::uuid),
      ('move', 'bad9c24b-0644-4438-82cb-fcfb6d8ad11c', '1fb48c13-8160-4d1f-bf0b-115bc14ff59c',
       '002344e9-a8a0-4478-8e82-b64bb464e354', 264, 270, '2023-10-21 04:15:54+00', NULL),
      ('move', 'bad9c24b-0644-4438-82cb-fcfb6d8ad11c', '8b22ca15-2721-45a9-8ef7-9ef713f2e0a4',
       'c4b2677b-a89f-482c-bb05-bc33df17aa09', 263, 262, '2023-10-21 02:21:30+00', NULL),
      ('move', '614ffdb4-c0c5-464c-a11d-f85a7b7cc44d', '0ba88367-3513-48dc-90a0-cf284a681971',
       '9c0ab707-39f6-4233-ad1e-bf7e27769396', 273, 272, '2026-04-29 05:15:09+00', NULL),
      ('move', '3bc750e4-0da9-49d9-98b7-449345696cf7', '4025d837-921e-4185-bcba-f36995692d55',
       'd7bf2c4f-7754-475a-bf79-acd6a1552c64', 149, 210, '2022-05-02 05:18:54+00', NULL),
      ('move', '0556a362-001e-44c9-b5ae-bbea67bada54', '9d5277d2-8ff5-48e8-887a-e3b379ee197e',
       '53449623-b0ed-42bf-a041-a8d118d9d497', 475, 301, '2026-11-04 05:26:30+00', NULL),
      ('hide', '3bc750e4-0da9-49d9-98b7-449345696cf7', '680612f1-f7c9-467b-963e-c1673003e46e',
       '07fae5fa-340a-4cf9-b379-3fb913c03d66', 149, 150, '2022-05-08 03:58:12+00', '7c30dc5c-f198-42cf-b41f-9eba40fc4563'),
      ('hide', '3bc750e4-0da9-49d9-98b7-449345696cf7', '3c1b05ab-7b96-49c1-bf77-2c62c1783fa2',
       '4d312f93-f031-457e-b6e0-679c206ccdc1', 149, 151, '2022-05-08 03:56:24+00', '52de0da9-9c48-4e32-99e1-c8e8777ca25e')
    ) AS x(action, user_public_id, visit_id, photo_id, from_id, to_id, shot_at, dup_visit_id)
  LOOP
    SELECT auth_uid INTO v_uid FROM public.app_user WHERE id = t.user_public_id;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'app_user not found: %', t.user_public_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.manhole WHERE id = t.to_id) THEN
      RAISE EXCEPTION 'manhole % が無い', t.to_id;
    END IF;
    -- 写真が1枚だけの訪問に限る（ほかの写真まで一緒に動かさない）
    SELECT count(*) INTO v_n FROM public.photo WHERE visit_id = t.visit_id;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'visit % の写真が % 枚（1枚のはず）', t.visit_id, v_n;
    END IF;

    PERFORM 1 FROM public.visit WHERE id = t.visit_id FOR UPDATE;

    IF t.action = 'move' THEN
      IF EXISTS (SELECT 1 FROM public.visit AS v JOIN public.photo AS p ON p.visit_id = v.id
                 WHERE v.id = t.visit_id AND p.id = t.photo_id AND v.user_id = v_uid
                   AND v.manhole_id = t.to_id AND p.manhole_id = t.to_id) THEN
        v_already := v_already + 1;
        CONTINUE;
      END IF;

      UPDATE public.visit
      SET manhole_id = t.to_id,
          updated_at = now()
      WHERE id = t.visit_id
        AND user_id = v_uid
        AND manhole_id = t.from_id
        AND shot_at = t.shot_at;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'visit % が期待と違う（付け替えずに止める）', t.visit_id;
      END IF;

      UPDATE public.photo
      SET manhole_id = t.to_id
      WHERE id = t.photo_id
        AND visit_id = t.visit_id
        AND manhole_id = t.from_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'photo % が期待と違う（付け替えずに止める）', t.photo_id;
      END IF;
      v_moved := v_moved + 1;

    ELSE
      -- 正しい蓋の側に、同じ投稿者・同じ撮影時刻の公開の訪問があるときだけ隠す
      IF NOT EXISTS (SELECT 1 FROM public.visit
                     WHERE id = t.dup_visit_id AND user_id = v_uid AND manhole_id = t.to_id
                       AND shot_at = t.shot_at AND is_public = true) THEN
        RAISE EXCEPTION '重複の visit % が期待と違う（隠さずに止める）', t.dup_visit_id;
      END IF;
      IF EXISTS (SELECT 1 FROM public.visit
                 WHERE id = t.visit_id AND user_id = v_uid AND manhole_id = t.from_id
                   AND shot_at = t.shot_at AND is_public = false) THEN
        v_already := v_already + 1;
        CONTINUE;
      END IF;

      UPDATE public.visit
      SET is_public = false,
          updated_at = now()
      WHERE id = t.visit_id
        AND user_id = v_uid
        AND manhole_id = t.from_id
        AND shot_at = t.shot_at
        AND is_public = true;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'visit % が期待と違う（隠さずに止める）', t.visit_id;
      END IF;
      v_hidden := v_hidden + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'moved % visit+photo, hid % duplicate visit, % already fixed', v_moved, v_hidden, v_already;
END $$;
