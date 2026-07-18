-- ensureAppUser の write amplification を解消する。
-- Supabase JS の upsert は ON CONFLICT DO UPDATE ... WHERE をサポートしないため
-- SECURITY DEFINER 関数で差分更新を実装する。
--
-- 動作:
--   - 行が存在しない → INSERT
--   - 行が存在し p_display_name が NULL → DO NOTHING（既存の名前を守る）
--   - 行が存在し p_display_name が現在値と同じ → DO NOTHING（書き込みなし）
--   - 行が存在し p_display_name が現在値と異なる → UPDATE

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
    WHERE p_display_name IS NOT NULL
      AND app_user.display_name IS DISTINCT FROM EXCLUDED.display_name;
$$;

GRANT EXECUTE ON FUNCTION upsert_app_user(uuid, text) TO authenticated;
