-- 公開スタンプ帳に表示する任意プロフィール項目を追加する。
-- app_user 自体は公開せず、公開読み取りは get_public_user_info() に限定する。

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS x_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS profile_is_customized boolean NOT NULL DEFAULT false;

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS app_user_display_name_length,
  DROP CONSTRAINT IF EXISTS app_user_bio_length,
  DROP CONSTRAINT IF EXISTS app_user_x_url_length,
  DROP CONSTRAINT IF EXISTS app_user_instagram_url_length;

ALTER TABLE app_user
  ADD CONSTRAINT app_user_display_name_length
    CHECK (display_name IS NULL OR char_length(display_name) <= 40),
  ADD CONSTRAINT app_user_bio_length
    CHECK (bio IS NULL OR char_length(bio) <= 160),
  ADD CONSTRAINT app_user_x_url_length
    CHECK (x_url IS NULL OR char_length(x_url) <= 300),
  ADD CONSTRAINT app_user_instagram_url_length
    CHECK (instagram_url IS NULL OR char_length(instagram_url) <= 300);

-- CREATE OR REPLACE では RETURNS TABLE の列を変更できないため、いったん削除する。
DROP FUNCTION IF EXISTS get_public_user_info(uuid);
CREATE FUNCTION get_public_user_info(p_user_id uuid)
RETURNS TABLE (
  auth_uid uuid,
  display_name text,
  bio text,
  x_url text,
  instagram_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.auth_uid, au.display_name, au.bio, au.x_url, au.instagram_url
  FROM app_user au
  WHERE au.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION get_public_user_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_user_info(uuid) TO anon, authenticated;

-- auth.uid() から対象行を決め、他ユーザーのプロフィールを更新できないようにする。
CREATE OR REPLACE FUNCTION update_own_public_profile(
  p_display_name text,
  p_bio text,
  p_x_url text,
  p_instagram_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text := nullif(btrim(p_display_name), '');
  v_bio text := nullif(btrim(p_bio), '');
  v_x_url text := nullif(btrim(p_x_url), '');
  v_instagram_url text := nullif(btrim(p_instagram_url), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;
  IF char_length(v_display_name) > 40 OR char_length(COALESCE(v_bio, '')) > 160 THEN
    RAISE EXCEPTION 'Profile text is too long';
  END IF;
  IF v_x_url IS NOT NULL AND v_x_url !~* '^https://(www\.)?(x\.com|twitter\.com)/[^/[:space:]]+/?$' THEN
    RAISE EXCEPTION 'Invalid X URL';
  END IF;
  IF v_instagram_url IS NOT NULL AND v_instagram_url !~* '^https://(www\.)?instagram\.com/[^/[:space:]]+/?$' THEN
    RAISE EXCEPTION 'Invalid Instagram URL';
  END IF;

  UPDATE app_user
  SET display_name = v_display_name,
      bio = v_bio,
      x_url = v_x_url,
      instagram_url = v_instagram_url,
      profile_is_customized = true,
      updated_at = now()
  WHERE auth_uid = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_own_public_profile(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_own_public_profile(text, text, text, text) TO authenticated;

-- ログインメタデータ由来の名前で、ユーザーが明示的に編集した名前を上書きしない。
CREATE OR REPLACE FUNCTION upsert_app_user(
  p_auth_uid uuid,
  p_display_name text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO app_user (auth_uid, display_name)
  VALUES (p_auth_uid, p_display_name)
  ON CONFLICT (auth_uid) DO UPDATE
    SET display_name = EXCLUDED.display_name
    WHERE NOT app_user.profile_is_customized
      AND p_display_name IS NOT NULL
      AND app_user.display_name IS DISTINCT FROM EXCLUDED.display_name;
$$;
