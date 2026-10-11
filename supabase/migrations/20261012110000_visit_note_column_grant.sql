-- visit.note（非公開メモ）を本人以外から読めなくする（列単位の GRANT にして note を外す）
--
-- 背景（2026-10-11 に本番を実測して判明）:
--
-- visit はテーブル単位で anon / authenticated に GRANT SELECT されたまま
-- （20260718000000_prod_baseline）。RLS は「公開訪問か自分の訪問」の行を通すので、
-- 公開 anon キーで PostgREST を直接叩くと、公開訪問の note が全部読めた
-- （note あり 2,171 行）。アプリの API は本人以外に note を返さないようにしているが、
-- API 層はセキュリティ境界ではない（20260810120000 と同じ構造）。
--
-- anon だけ閉じても足りない。アカウントは誰でも作れるので、authenticated から
-- 他人の公開訪問の note が読めるなら実質だれでも読める。列の権限は行ごとに
-- 分けられないので、note は anon / authenticated の両方から外し、本人の note は
-- get_own_visit_notes()（20261012100000）で auth.uid() に一致する行だけ返す。
--
-- 書き込み（INSERT / UPDATE の note）はテーブル単位の GRANT のまま変えない。
-- ただし RETURNING に note が入ると 42501 になるので、アプリは insert().select() で
-- 列を名指しする（20261012100000 と同じ PR で対応済み）。
--
-- 外さない列: user_id / shot_location。user_id を外すのは公開プロフィールなど
-- anon の読み取り経路の移設が要る（2026-08-11 の設計の M2）ので別件。
--
-- 適用順: このマイグレーションは、note を select しなくなったアプリが本番に
-- 出てから適用する。先に適用すると、旧アプリの写真一覧（note を select している）が
-- 全員 42501 で落ちる。
--
-- ロールバック:
--   GRANT SELECT ON public.visit TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. 列を名指しにする（note を含めない）
--
-- テーブル単位の GRANT は「今ある列も、これから増える列も全部」を意味する。
-- 名指しにしておけば、将来足した列も自動では公開されない。
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.visit FROM anon, authenticated;
GRANT SELECT (
  id,
  user_id,
  manhole_id,
  shot_location,
  shot_at,
  created_at,
  updated_at,
  is_public,
  comment
) ON public.visit TO anon, authenticated;
