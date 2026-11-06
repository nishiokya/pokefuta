-- プロフィールのアイコンを「自分が撮った公開写真の1枚」から選べるようにする
--
-- ===========================================================================
-- 方針
-- ===========================================================================
--
-- 1. 画像の URL ではなく写真の ID を持つ。
--
--    既存の app_user.avatar_url は使わない。authenticated に列単位の
--    INSERT / UPDATE が残っており（prod_baseline）、自分の行なら PostgREST から
--    任意の文字列を書ける。表示に使い始めた瞬間、外部の画像 URL（追跡ピクセル等）を
--    公開ページに埋め込めることになる。
--    新しい列 avatar_photo_id には anon / authenticated への GRANT を一切与えず、
--    下の SECURITY DEFINER 関数だけが書く。
--
-- 2. 選べるのは「自分の公開訪問の写真」だけ。保存時と表示時の両方で確かめる。
--
--    保存時だけだと、後から訪問を非公開に戻したとき、アイコンとして写真が
--    公開ページに出続ける（行った場所が漏れる）。表示用の関数は呼ばれるたびに
--    親 visit の is_public と持ち主を見直し、条件を外れたら NULL を返す。
--    列の値は残すので、公開に戻せばアイコンも戻る。
--
-- 3. 既存の関数には触らない（追加だけ）。
--
--    get_public_profile() / get_own_profile() に列を足すと返り値の型が変わり、
--    DROP して作り直すことになる。マイグレーションの適用とデプロイは連動せず、
--    ロールバックはコードだけを戻すので、既存の経路を作り直さない方が安全。
--    旧コードはこの3関数を呼ばないので、適用しても何も変わらない。
--
-- 写真を消したら ON DELETE SET NULL でアイコンも外れる（訪問の削除は photo を
-- CASCADE で消すので同じく外れる）。
--
-- SECURITY DEFINER 関数は REVOKE ... FROM PUBLIC して名指しで GRANT する。
-- Supabase は public の新しい関数に anon / authenticated の EXECUTE を既定で付けるので、
-- 本人用の関数は anon も名指しで外す（PUBLIC からの REVOKE だけでは anon に残る）。
-- 書き忘れると photo_scorer の自己点検（scoring.audit_photo_scorer）が違反を返し、
-- k11 の自動採点が止まる。search_path は pg_temp を最後に置く（CLAUDE.md）。

-- ---------------------------------------------------------------------------
-- 1. 列
-- ---------------------------------------------------------------------------

ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS avatar_photo_id uuid
    REFERENCES public.photo(id) ON DELETE SET NULL;

-- 写真の削除で SET NULL を探すときの索引。app_user は小さいが、photo の削除の
-- たびに全件を舐めないようにしておく。
CREATE INDEX IF NOT EXISTS idx_app_user_avatar_photo_id
  ON public.app_user (avatar_photo_id)
  WHERE avatar_photo_id IS NOT NULL;

COMMENT ON COLUMN public.app_user.avatar_photo_id IS
  'プロフィールのアイコンにする写真（本人の公開訪問の写真）。anon / authenticated への GRANT は無く、'
  ' set_own_avatar_photo() だけが書く。公開経路は get_public_avatar_photo_id() で、'
  ' 親の訪問が非公開になっていれば NULL を返す（2026-11-06）。';

-- ---------------------------------------------------------------------------
-- 2. 保存（NULL で外す）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_own_avatar_photo(p_photo_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_photo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.photo p
      JOIN public.visit v ON v.id = p.visit_id
     WHERE p.id = p_photo_id
       AND v.user_id = auth.uid()
       AND v.is_public IS TRUE
  ) THEN
    -- 他人の写真・非公開訪問の写真・存在しない ID を区別しない（存在の有無を漏らさない）
    RAISE EXCEPTION 'Photo is not available for avatar';
  END IF;

  UPDATE public.app_user
     SET avatar_photo_id = p_photo_id,
         updated_at = now()
   WHERE auth_uid = auth.uid();

  -- 写真を投稿した利用者には必ず行がある（/api/image-upload が ensureAppUser を呼ぶ）。
  -- 行が無いのは写真を1枚も持たない人で、外す操作（NULL）なら何もしなくてよい。
  IF NOT FOUND AND p_photo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN p_photo_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_own_avatar_photo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_avatar_photo(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_own_avatar_photo(uuid) IS
  '自分のアイコンを自分の公開訪問の写真から選ぶ。NULL で外す。'
  ' 他人の写真・非公開訪問の写真は弾く（2026-11-06）。';

-- ---------------------------------------------------------------------------
-- 3. 自分のアイコン（/profile の表示用）
--
-- 保存済みの値をそのまま返すのではなく、公開経路と同じ条件で見直す。
-- 訪問を非公開にしてアイコンが公開ページから消えているのに、/profile では
-- 付いているように見える、というずれを作らない。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_own_avatar_photo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT au.avatar_photo_id
    FROM public.app_user au
    JOIN public.photo p ON p.id = au.avatar_photo_id
    JOIN public.visit v ON v.id = p.visit_id
   WHERE au.auth_uid = auth.uid()
     AND v.user_id = au.auth_uid
     AND v.is_public IS TRUE;
$function$;

REVOKE ALL ON FUNCTION public.get_own_avatar_photo_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_avatar_photo_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 公開ページのアイコン
--
-- 公開ID（app_user.id）で引き、写真の ID だけを返す。auth_uid は返さない。
-- 写真そのものは /api/photo/<id>?size=small が public_select_photos の RLS で出す。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_avatar_photo_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT au.avatar_photo_id
    FROM public.app_user au
    JOIN public.photo p ON p.id = au.avatar_photo_id
    JOIN public.visit v ON v.id = p.visit_id
   WHERE au.id = p_user_id
     -- 持ち主の確認は保存時にもしているが、表示のたびに見直す。
     -- photo.visit_id が付け替えられても他人の写真をアイコンに出さない。
     AND v.user_id = au.auth_uid
     AND v.is_public IS TRUE;
$function$;

REVOKE ALL ON FUNCTION public.get_public_avatar_photo_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_avatar_photo_id(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_avatar_photo_id(uuid) IS
  '公開ページのアイコン。本人の公開訪問の写真のときだけ写真IDを返し、それ以外は NULL。'
  ' auth_uid は返さない（2026-11-06）。';
