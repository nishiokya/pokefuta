-- app_user の公開面を絞る
--
-- 背景（2026-08-10 に本番を実測して判明）:
--
-- Supabase は anon キーで PostgREST を直接叩ける設計で、アプリの API 層は
-- セキュリティ境界ではない。境界は GRANT と RLS だけ。app_user では両方が開いていた。
--
--   pg_class.relacl   anon=rDtm / authenticated=rDtm  ← テーブル単位の SELECT
--   pg_policies       app_user_public_read     USING (true)   {anon,authenticated}
--                     app_user_select_public   USING (true)   {anon,authenticated}
--
-- 結果として anon は全ユーザーの全列（auth_uid・display_name・bio・x_url・
-- instagram_url・バッジの達成時刻）を読めていた。
--
-- 意図はもともと列を絞ることだった痕跡が残っている。pg_attribute.attacl には
--   auth_uid      anon=r  / authenticated=ar
--   display_name  anon=r  / authenticated=arw
--   avatar_url            / authenticated=aw
-- という列ACLが入っており、`src/app/api/visits/route.ts` にも
-- 「app_user.id への直接SELECT権限は削除済み」というコメントがある。
-- しかしテーブル単位の GRANT SELECT が残っていたため、列ACLは一度も効いていなかった。
-- photo が exif を漏らしていたのと同じ形（#211）。
--
-- 公開プロフィールの読み出しは既に SECURITY DEFINER の RPC を通っており
-- （get_public_user_info / get_public_user_ids / get_own_profile /
--   update_own_public_profile / upsert_app_user）、テーブルへの直接 SELECT に
-- 依存しているのは以下だけ。2026-08-10 時点で grep 済み。
--
--   src/app/api/badges/global/route.ts       all_prefectures_completed_at, all_prefectures_outdated_at
--   src/app/api/badges/prefectures/route.ts  同上
--   src/components/DevDebugPanel.tsx         auth_uid（開発用パネル）
--
-- いずれもログイン済みユーザーが自分の行を読むだけなので、anon の SELECT は不要。

-- ---------------------------------------------------------------------------
-- 1. 列を名指しにする
--
-- テーブル単位の GRANT は「今ある列も、これから増える列も全部」を意味する。
-- ここを閉じておかないと、プロフィールに列を1つ足した瞬間に自動で公開される。
-- （Pokémon GO のトレーナーコードを足す検討がまさにこれに当たる）
--
-- 列ACLはテーブル単位の REVOKE では消えないので、残骸も名指しで落とす。
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.app_user FROM anon, authenticated;
REVOKE SELECT (auth_uid, display_name, avatar_url) ON public.app_user FROM anon, authenticated;

-- anon には SELECT を一切与えない。公開プロフィールは RPC 経由に一本化する。
GRANT SELECT (
  auth_uid,
  all_prefectures_completed_at,
  all_prefectures_outdated_at
) ON public.app_user TO authenticated;

-- INSERT / UPDATE の列ACL（authenticated の auth_uid・display_name・avatar_url）は
-- 触らない。upsert_app_user / update_own_public_profile が SECURITY DEFINER なので
-- 実際には使われていないが、ここで剥がすと投稿系の退行と切り分けにくくなる。

-- ---------------------------------------------------------------------------
-- 2. 行を自分のものだけにする
--
-- SELECT ポリシーが4本あり、うち2本が USING (true) の重複、残り2本が
-- `auth.uid() = auth_uid` の重複だった。RLS の複数ポリシーは OR で評価されるので、
-- 重複を1本ずつ消しても USING (true) が残っている限り何も変わらない。まとめて消す。
--
-- 直接 SELECT している3箇所はいずれも自分の行しか読まないので影響しない。
-- `/api/badges/prefectures` は doc コメントに `userId` クエリを受けると書いてあるが、
-- 実装は `user.id` 固定でパラメータを見ていない（コメントの側を実装に合わせて直した）。
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS app_user_public_read ON public.app_user;
DROP POLICY IF EXISTS app_user_select_public ON public.app_user;
DROP POLICY IF EXISTS users_select_own_app_user ON public.app_user;

COMMENT ON POLICY users_select_own ON public.app_user IS
  'app_user への直接 SELECT は自分の行だけ。公開プロフィールは SECURITY DEFINER の'
  ' get_public_user_info() を通す。以前は USING (true) のポリシーが2本あり、'
  ' anon が全ユーザーの全列を読めていた（2026-08-10 修正）。';

-- ---------------------------------------------------------------------------
-- 3. get_public_user_info を「公開訪問があるユーザー」に限る
--
-- この関数は auth_uid を返す（issue #187）。呼び出し側は公開スタンプ帳の
-- visit を引くために使っており、単純に返り値から外すと公開ページが壊れる。
--
-- 代わりに行を絞る。auth_uid は `visit.user_id` にそのまま入っていて、
-- 公開訪問の行は anon から読めるので、公開訪問を持つユーザーの auth_uid は
-- どのみち引ける。公開訪問が1件も無いユーザー（本番で 74人中 34人）の auth_uid
-- だけが、この関数を通してのみ漏れていた。そこを塞ぐ。
--
-- 同じ条件は get_public_user_ids() が既に持っている。片方だけ抜けていた。
--
-- 副作用: 公開訪問が0件のユーザーの公開ページが 404 になる。
-- 表示できる公開コンテンツが無いページなので、表示名と bio だけが出ていた状態より正しい。
-- （呼び出し側は null を notFound() に落とす実装になっている）
--
-- 返り値から auth_uid 自体を外すには、公開 visit の取得ごと SECURITY DEFINER 側へ
-- 移す必要がある。それは別途。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_user_info(p_user_id uuid)
RETURNS TABLE(auth_uid uuid, display_name text, bio text, x_url text, instagram_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT au.auth_uid, au.display_name, au.bio, au.x_url, au.instagram_url
  FROM app_user au
  WHERE au.id = p_user_id
    AND EXISTS (
      SELECT 1 FROM visit v
      WHERE v.user_id = au.auth_uid AND v.is_public = true
    );
$function$;

COMMENT ON FUNCTION public.get_public_user_info(uuid) IS
  '公開スタンプ帳の表示用。公開訪問を1件以上持つユーザーの行だけを返す。'
  ' 条件は get_public_user_ids() と揃えてある（2026-08-10）。';
