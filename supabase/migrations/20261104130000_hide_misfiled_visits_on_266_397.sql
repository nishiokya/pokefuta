-- manhole 266（西和賀）と 397（北上）に、別のポケふたの写真が公開で載っているので非公開にする。
--
-- 2026-11-04。同じ投稿者が同じ写真（shot_at・file_size が一致）を正しいポケふたにも投稿し直していて、
-- 266・397 側は選び間違い。写真の判定モデル（pokefuta-id）でも正しい側が1位（0.90〜0.98）。
-- 266 の 7592575b… と 397 の c614f521… は本当にそのポケふたの写真なので残す。
-- 正しい側の公開・非公開は投稿者が決めたものなので触らない。消さずに非公開にする。
--
-- ユーザーは公開ID（app_user.id）で確かめ、auth UID はこのファイルに書かない。
-- 正しいポケふた側に同じ投稿者・同じ撮影時刻の visit があるときだけ動く。
--
-- ロールバック:
--   UPDATE public.visit SET is_public = true WHERE id IN (<下の visit_id>);
DO $$
DECLARE
  v_owner uuid;
  v_hidden integer;
BEGIN
  SELECT auth_uid INTO v_owner FROM public.app_user WHERE id = '189b4c95-94f9-421a-951a-256bbef62c38';
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'app_user not found';
  END IF;

  WITH misfiled(visit_id, wrong_manhole_id, correct_manhole_id) AS (
    VALUES
      ('fe823663-cbb7-49b8-973f-779f4bc3095f'::uuid, 266, 16),
      ('7df9e254-6400-436e-9a18-0eb03e3a8b48'::uuid, 266, 15),
      ('7e048b43-0a09-4fc5-a7cb-2a71cd8e7412'::uuid, 266, 13),
      ('2894cfd3-917d-453a-a20b-6523c54286dc'::uuid, 266, 14),
      ('f120d437-f714-43e7-b5de-213687c3ff79'::uuid, 266, 18),
      ('93f7fc83-564d-42ae-8a11-c4e29e69e951'::uuid, 266, 17),
      ('968b7872-3725-4ec2-a146-0ba54672397b'::uuid, 266, 21),
      ('126a127e-cea8-4b80-a7be-088f78391aae'::uuid, 266, 19),
      ('bf68ec32-23a3-41fe-b614-6b9bec5a8af0'::uuid, 266, 20),
      ('a59633bb-234f-4b78-b081-588ab55c9f4b'::uuid, 266, 259),
      ('2b3dde6b-0968-4663-a856-0cc1b1b2480f'::uuid, 266, 258),
      ('ec32b2fe-dcf0-4f99-8e94-13b3f4099904'::uuid, 397, 132),
      ('108c1d29-7e35-4720-9a7a-d4702fdcab0d'::uuid, 397, 121)
  )
  UPDATE public.visit AS v
  SET is_public = false,
      updated_at = now()
  FROM misfiled AS m
  WHERE v.id = m.visit_id
    AND v.user_id = v_owner
    AND v.manhole_id = m.wrong_manhole_id
    AND v.is_public = true
    AND EXISTS (
      SELECT 1 FROM public.visit AS v2
      WHERE v2.user_id = v_owner
        AND v2.manhole_id = m.correct_manhole_id
        AND v2.shot_at = v.shot_at
    );
  GET DIAGNOSTICS v_hidden = ROW_COUNT;

  RAISE NOTICE 'hid % misfiled visits', v_hidden;
END $$;
