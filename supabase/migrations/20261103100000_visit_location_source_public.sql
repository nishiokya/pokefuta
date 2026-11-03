-- visit.location_source（撮影位置の有無）を公開側からも読めるようにする
--
-- 背景（2026-11-03）:
--
-- 20261030120000 では「公開の写真に印は出さない」として列単位 GRANT に入れなかった。
-- 現地で「この写真は本当にこの場所で撮られたか」を見分けたいので、
-- 詳細ページの写真に「位置情報あり／なし」のアイコンを出す（ユーザー決定で方針を変更）。
--
-- 出すのは 'gps' / 'none' の印だけ。座標そのもの（shot_location）の扱いは変えない。
--
-- 適用順: このマイグレーションを先に本番へ当て、そのあとでアプリを出す。
-- 先にアプリが出ると、写真一覧が location_source を select して 42501 で全員落ちる。
--
-- ロールバック（アプリを戻してから）:
--   REVOKE SELECT (location_source) ON public.visit FROM anon, authenticated;

GRANT SELECT (location_source) ON public.visit TO anon, authenticated;

COMMENT ON COLUMN public.visit.location_source IS
  '撮影位置の有無（shot_location から自動で決まる）。gps=あり、none=なし（マンホール詳細から投稿者が蓋を選んだ）。詳細ページの写真のアイコンに使うので公開。';
