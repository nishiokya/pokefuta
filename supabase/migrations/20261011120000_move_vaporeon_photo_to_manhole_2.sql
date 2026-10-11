-- manhole 4（指宿・ブースター）に入っていたシャワーズの写真を manhole 2（指宿・シャワーズ）へ移す。
--
-- 2026-10-11、manhole 4 の写真一覧にシャワーズが混ざっていると気づいた（2つの蓋は
-- 0.2km しか離れていない）。同じ写真が2回、manhole 4 に投稿されている
-- （file_size・shot_at が一致）。
--   - visit 24706a68…（photo 573e37e2…）: manhole 2 へ移す（visit と photo の両方が manhole_id を持つ）
--   - visit a217e0f3…（photo 38af8e59…）: 上の重複。消さずに非公開にする
--
-- ユーザーは公開ID（app_user.id）で確かめ、auth UID はこのファイルに書かない。
-- visit / photo に manhole_id を見るトリガは無い（photo の BEFORE UPDATE トリガは
-- anon / authenticated からの採点列の変更を戻すだけ）。県バッジの作成は訪問記録の
-- 変更では動かない（create_prefecture_badge は今どこからも呼ばれていない）。
--
-- ロールバック:
--   UPDATE public.visit SET manhole_id = 4 WHERE id = '24706a68-ebc1-462c-8be7-0b5f43b70e7d';
--   UPDATE public.photo SET manhole_id = 4 WHERE id = '573e37e2-fa42-45b1-8b70-d459e210f135';
--   UPDATE public.visit SET is_public = true WHERE id = 'a217e0f3-dcec-4675-9f10-3d9aef2c4fed';
DO $$
DECLARE
  v_owner uuid;
  v_visit integer;
  v_photo integer;
  v_hidden integer;
BEGIN
  SELECT auth_uid INTO v_owner FROM public.app_user WHERE id = '7c6e22a2-763d-4ee0-9762-3cbe52943be7';
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'app_user not found';
  END IF;

  -- 行の中身まで一致するときだけ動かす。すでに直っている場合は何もしない
  -- （流し直しても無害にする）
  UPDATE public.visit
  SET manhole_id = 2,
      updated_at = now()
  WHERE id = '24706a68-ebc1-462c-8be7-0b5f43b70e7d'
    AND user_id = v_owner
    AND manhole_id = 4
    AND shot_at = '2026-07-10T07:19:25+00:00';
  GET DIAGNOSTICS v_visit = ROW_COUNT;

  UPDATE public.photo
  SET manhole_id = 2
  WHERE id = '573e37e2-fa42-45b1-8b70-d459e210f135'
    AND visit_id = '24706a68-ebc1-462c-8be7-0b5f43b70e7d'
    AND manhole_id = 4;
  GET DIAGNOSTICS v_photo = ROW_COUNT;

  IF v_visit <> v_photo THEN
    RAISE EXCEPTION 'visit と photo の移動件数が合わない (visit=%, photo=%)', v_visit, v_photo;
  END IF;

  UPDATE public.visit
  SET is_public = false,
      updated_at = now()
  WHERE id = 'a217e0f3-dcec-4675-9f10-3d9aef2c4fed'
    AND user_id = v_owner
    AND manhole_id = 4
    AND shot_at = '2026-07-10T07:19:25+00:00'
    AND is_public = true;
  GET DIAGNOSTICS v_hidden = ROW_COUNT;

  RAISE NOTICE 'moved % visit / % photo, hid % duplicate visit', v_visit, v_photo, v_hidden;
END $$;
