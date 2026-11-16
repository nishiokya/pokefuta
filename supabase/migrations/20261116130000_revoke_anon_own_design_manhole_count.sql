-- get_own_design_manhole_count() の anon 実行権限を外す。
--
-- 20261029120000_design_manhole_public_surface.sql は REVOKE ... FROM PUBLIC と authenticated, service_role への GRANT だけで、
-- Supabase が新しい関数に自動で付ける anon の実行権限を外していなかった（REVOKE FROM PUBLIC では外れない）。
-- 自分の枚数は auth.uid() で決まるので anon が呼んでも NULL 相当で害は小さいが、
-- 「自分の」関数は anon に渡さない（get_own_snow_visit_count と同じ）。
-- 呼び出しは /visits の loadPassport（ログイン時のみ）だけで、anon で呼ぶ箇所は無い。
--
-- 権限を1つ外すだけで、関数の中身・他のロールは変えない。
--
-- ロールバック:
--   GRANT EXECUTE ON FUNCTION public.get_own_design_manhole_count() TO anon;

REVOKE ALL ON FUNCTION public.get_own_design_manhole_count() FROM anon;
