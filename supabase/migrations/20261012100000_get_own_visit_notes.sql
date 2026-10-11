-- 本人の visit.note だけを返す読み口を足す（追加のみ・後方互換）
--
-- 2026-10-11、公開 anon キーで PostgREST を直接叩くと公開訪問の note（非公開メモ）が
-- 全部読めると分かった（note あり 2,171 行）。visit がテーブル単位で anon /
-- authenticated に GRANT SELECT されているため。note の SELECT を外すのは
-- 20261012110000_visit_note_column_grant.sql（このファイルを入れたアプリが本番に出てから適用）。
--
-- この関数はアプリが note を読む唯一の経路になる。追加だけなので、旧アプリには影響しない。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.get_own_visit_notes(uuid[]);

-- ---------------------------------------------------------------------------
-- 本人の note だけを返す読み口
--
-- SECURITY DEFINER なので所有者（postgres）の権限で visit を読む。行の絞り込みは
-- 関数の中の user_id = auth.uid() だけが担う。search_path は空にして全部修飾する
-- （CLAUDE.md: pg_temp による乗っ取りを防ぐ）。PUBLIC から EXECUTE を外して
-- authenticated だけに渡す（photo_scorer の権限点検にも掛からない）。
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_own_visit_notes(p_visit_ids uuid[])
RETURNS TABLE (visit_id uuid, note text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT v.id, v.note
  FROM public.visit v
  WHERE v.id = ANY (p_visit_ids[1:1000])
    AND v.user_id = auth.uid()
    AND v.note IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_own_visit_notes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_visit_notes(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_own_visit_notes(uuid[]) IS
  '呼び出した本人の visit の note だけを返す。visit.note の SELECT は'
  ' anon / authenticated に渡さない（20261012110000）。1回に最大1000件。';
