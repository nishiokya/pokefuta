-- 別人の名義で保存された投稿 1 件を、実際に撮った人の名義へ戻す。
--
-- 2026-09-26、CloudFront がセッション更新の Set-Cookie を共有キャッシュして
-- 別人のブラウザに配ったため、ある投稿が別のアカウントの名義で保存された
-- （原因の修正は PR #275）。
--
-- ユーザーは公開ID（app_user.id、/users/<id>/visits の <id>）で指定し、
-- auth UID はこのファイルに書かない。
-- 投稿者を表すのは visit.user_id だけ（photo は visit_id 経由で辿る）。visit に
-- トリガは無く、どちらのユーザーも県コンプの境目をまたがないのでバッジは動かない。
--
-- ロールバック:
--   UPDATE public.visit
--   SET user_id = (SELECT auth_uid FROM public.app_user WHERE id = '08c2bb09-8aa0-44f7-8287-7b332a589f33')
--   WHERE id = 'c84c9f86-4115-42a3-81b7-16212df884b8';
DO $$
DECLARE
  v_from uuid;
  v_to uuid;
  v_updated integer;
BEGIN
  SELECT auth_uid INTO v_from FROM public.app_user WHERE id = '08c2bb09-8aa0-44f7-8287-7b332a589f33';
  SELECT auth_uid INTO v_to   FROM public.app_user WHERE id = '63240b9e-8907-452b-889d-7c94ab6ffad1';
  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'app_user not found (from=%, to=%)', v_from, v_to;
  END IF;

  -- 行の中身まで一致するときだけ動かす。すでに直っている場合は何もしない
  -- （流し直しても無害にする）
  UPDATE public.visit
  SET user_id = v_to,
      updated_at = now()
  WHERE id = 'c84c9f86-4115-42a3-81b7-16212df884b8'
    AND user_id = v_from
    AND manhole_id = 470
    AND shot_at = '2026-09-26T04:18:17+00:00';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE NOTICE 'reassigned % visit row(s)', v_updated;
END $$;
