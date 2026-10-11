-- manhole 4（指宿・ブースター）に残っていたシャワーズの写真を非公開にする。
--
-- 2026-10-11（20261011120000 の続き）。同じ投稿者が同じ写真を manhole 2（シャワーズ）にも
-- 投稿している（photo 3743c530…、file_size・shot_at が一致）ので、manhole 4 側の
-- visit 0e871eb8…（photo f7170f8e…）は重複。消さずに非公開にする。
--
-- ユーザーは公開ID（app_user.id）で確かめ、auth UID はこのファイルに書かない。
-- manhole 2 側に同じ投稿者・同じ撮影時刻の公開 visit があるときだけ動く。
--
-- ロールバック:
--   UPDATE public.visit SET is_public = true WHERE id = '0e871eb8-0ee0-44ed-8e1a-bc51d8b2df2a';
DO $$
DECLARE
  v_owner uuid;
  v_hidden integer;
BEGIN
  SELECT auth_uid INTO v_owner FROM public.app_user WHERE id = '6096691c-eeda-4e73-8401-a11274868ede';
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'app_user not found';
  END IF;

  UPDATE public.visit
  SET is_public = false,
      updated_at = now()
  WHERE id = '0e871eb8-0ee0-44ed-8e1a-bc51d8b2df2a'
    AND user_id = v_owner
    AND manhole_id = 4
    AND shot_at = '2026-06-07T23:44:44+00:00'
    AND is_public = true
    AND EXISTS (
      SELECT 1 FROM public.visit v2
      WHERE v2.user_id = v_owner
        AND v2.manhole_id = 2
        AND v2.shot_at = '2026-06-07T23:44:44+00:00'
        AND v2.is_public = true
    );
  GET DIAGNOSTICS v_hidden = ROW_COUNT;

  RAISE NOTICE 'hid % duplicate visit', v_hidden;
END $$;
