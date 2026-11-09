-- 公式ポケふたが写っているデザインマンホール投稿を、投稿者が同じ蓋をポケふたとして登録済みのときだけ非公開にする。
--
-- 2026-11-09。写真の GPS が公式の位置から 65〜217m ずれていたため、ポケふた投稿（50m 以内）で断られ、
-- デザインマンホールとして投稿された写真。蓋の縁の文字（ポケモン名・市町村名）で公式の蓋と照合済み。
--
--   44d264a6 → #160 京都 円山公園（65m）    同じ投稿者が 10 分後にポケふたとして登録済み
--   668c0895 → #29  丸亀 丸亀駅前（119m）   同じ投稿者が 30 分後に登録済み
--   5f3fda83 → #355 佐世保 新港町（171m）   同じ投稿者が 5 分後に登録済み
--   3fa561c2 → #474 仙台 海岸公園（217m）   2026-08 の投稿。#474 の visit があるときだけ隠す（無ければ残す）
--
-- 前例は 20261104120000_hide_duplicate_design_manholes.sql（同じく公式ポケふたの写ったデザインマンホール投稿を hidden）。
-- 'hidden' は投稿者本人には今までどおり見える（design_manhole_public_select）。visit / photo には触らない。
-- 図鑑（pokefuta-tracker）側は #849 で canonical_ref を付けてある。非公開になると次の日次取り込みで行ごと消える。
--
-- 投稿者は design_manhole.created_by（auth UID）で SQL の中で引き、このファイルには書かない。
-- 必須の 3 件のどれかで、投稿者の visit が無い・行が期待と違うときは全体を止める（何も書かない）。
-- すでに hidden の行は数えるだけ。
--
-- ロールバック:
--   UPDATE public.design_manhole SET status = 'published', updated_at = now()
--   WHERE id IN ('44d264a6-bd41-43eb-afc3-c17a0b697085', '668c0895-7655-4ea7-a776-51da929e27b3',
--                '5f3fda83-4f50-444e-aa92-60c451696811', '3fa561c2-0f91-4115-9212-5070e51ace9f')
--     AND status = 'hidden';
DO $$
DECLARE
  t record;
  v_owner uuid;
  v_status text;
  v_hidden integer := 0;
  v_already integer := 0;
  v_kept integer := 0;
  v_n integer;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      -- デザインマンホール投稿, 写っている公式の蓋, 投稿者の visit が必須か
      ('44d264a6-bd41-43eb-afc3-c17a0b697085'::uuid, 160, true),
      ('668c0895-7655-4ea7-a776-51da929e27b3'::uuid, 29, true),
      ('5f3fda83-4f50-444e-aa92-60c451696811'::uuid, 355, true),
      ('3fa561c2-0f91-4115-9212-5070e51ace9f'::uuid, 474, false)
    ) AS x(design_id, manhole_id, visit_required)
  LOOP
    SELECT created_by, status INTO v_owner, v_status
    FROM public.design_manhole
    WHERE id = t.design_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design_manhole % が無い', t.design_id;
    END IF;

    IF v_status = 'hidden' THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;
    IF v_status <> 'published' THEN
      RAISE EXCEPTION 'design_manhole % の status が %（published のはず）', t.design_id, v_status;
    END IF;

    -- 投稿者が同じ蓋をポケふたとして記録しているときだけ隠す（記録が消えたように見せない）
    IF NOT EXISTS (SELECT 1 FROM public.visit
                   WHERE user_id = v_owner AND manhole_id = t.manhole_id) THEN
      IF t.visit_required THEN
        RAISE EXCEPTION 'design_manhole % の投稿者に #% の visit が無い（隠さずに止める）', t.design_id, t.manhole_id;
      END IF;
      RAISE NOTICE 'design_manhole % は投稿者に #% の visit が無いので残す', t.design_id, t.manhole_id;
      v_kept := v_kept + 1;
      CONTINUE;
    END IF;

    UPDATE public.design_manhole
    SET status = 'hidden',
        updated_at = now()
    WHERE id = t.design_id
      AND status = 'published';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'design_manhole % が期待と違う（隠さずに止める）', t.design_id;
    END IF;
    v_hidden := v_hidden + 1;
  END LOOP;

  RAISE NOTICE 'hid % design_manhole, % already hidden, % kept (no visit)', v_hidden, v_already, v_kept;
END $$;
