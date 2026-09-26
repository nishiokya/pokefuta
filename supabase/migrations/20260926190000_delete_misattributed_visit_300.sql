-- 別人の名義で保存された投稿 1 件（manhole 300）を削除する。
--
-- 共有キャッシュに載ったセッション更新の Set-Cookie（PR #275 で修正）により、
-- 同行者の端末からの投稿がこのアカウントの名義で保存された。撮った人は直後に
-- 自分の名義で同じ蓋を投稿し直しており、写真はそちらに残っている。
-- 付け替えると撮った人の側で重複になるので、名義違いの方を消す（運営判断）。
--
-- ユーザーは公開ID（app_user.id）で指定し、auth UID はこのファイルに書かない。
-- photo / visit_like / visit_comment / visit_bookmark は visit への FK が
-- ON DELETE CASCADE なので一緒に消える（いずれも 0 件のはず）。
-- R2 の写真の実体（photos/original/2026/09/1fca4278-bb8b-4a4b-b127-34fdb0782062.jpg と
-- 派生サムネイル）はこのマイグレーションでは消えない。参照が無くなるだけで公開はされない。
--
-- 戻し方: 削除前の行は k11 の日次バックアップ（2026-09-26T0417+0900 以降の data.sql）に
-- visit `523999ca-0010-474d-9225-2f09fc74c55d` と photo `fc22fc64-cbdd-4107-96c6-485cdecefa41` として残っている。
DO $$
DECLARE
  v_owner uuid;
  v_deleted integer;
BEGIN
  SELECT auth_uid INTO v_owner FROM public.app_user WHERE id = '28bf9144-b490-4208-ad36-e0c1d4cef1b0';
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'app_user not found';
  END IF;

  -- 行の中身まで一致するときだけ消す。すでに消えている・中身が違う場合は何もしない
  -- （流し直しても無害にする）
  DELETE FROM public.visit
  WHERE id = '523999ca-0010-474d-9225-2f09fc74c55d'
    AND user_id = v_owner
    AND manhole_id = 300
    AND shot_at = '2026-09-10T06:50:01+00:00';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'deleted % visit row(s)', v_deleted;
END $$;
