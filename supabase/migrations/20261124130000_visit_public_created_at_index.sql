-- 公開訪問を新しい順に読むための索引。
--
-- トップの「最新の投稿」（/api/visits?order_by=created_at）と最近の口コミ（/api/recent-comments）は
-- is_public = true の訪問を created_at の降順で先頭から数十件読む。visit には created_at の索引が
-- 無く、公開訪問（約1万件）を全部読んで並べ替えていた。データがメモリから落ちているときは
-- anon の statement timeout（約3秒）を超え、トップのフィードが 500 で空になった（2026-11-24）。
--
-- 部分索引にして、RLS（users_select_own_or_public_visits）と呼び出し側の is_public = true に揃える。
-- ログイン中の自分の訪問は user_id で絞るので idx_visit_user_id で足りる。
--
-- CONCURRENTLY は付けない（マイグレーションはトランザクションの中で流れる）。visit は数万行に満たないので
-- 作成は1秒かからず、その間 visit への書き込みが待たされるだけ。
CREATE INDEX IF NOT EXISTS idx_visit_public_created_at
  ON public.visit USING btree (created_at DESC)
  WHERE is_public;
