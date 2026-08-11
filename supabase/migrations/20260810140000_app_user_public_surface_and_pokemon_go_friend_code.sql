-- app_user の公開面を絞り、Pokémon GO のトレーナーコードを任意公開できるようにする
--
-- 設計メモ: ~/note/dev/pokefuta/issue/2026-08-09 pokefuta 写真館 Pokémon GOフレンド募集.md
--
-- 公開面の修正と機能追加を1本にまとめてある。分けると本番への手作業適用が2回になり、
-- しかも get_public_user_info() を2回作り直すことになる。同じテーブル・同じ関数を
-- 触る変更なので、適用の単位としても1つが正しい。
--
-- ===========================================================================
-- 背景（2026-08-10 に本番を実測して判明）
-- ===========================================================================
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
-- 列を絞る意図はもともとあった痕跡が残っている。pg_attribute.attacl には
--   auth_uid      anon=r  / authenticated=ar
--   display_name  anon=r  / authenticated=arw
--   avatar_url            / authenticated=aw
-- という列ACLが入っており、`src/app/api/visits/route.ts` にも
-- 「app_user.id への直接SELECT権限は削除済み」というコメントがある。
-- しかしテーブル単位の GRANT SELECT が残っていたため、列ACLは一度も効いていなかった。
-- photo が exif を漏らしていたのと同じ形。
--
-- トレーナーコードはこの同じ公開面に載る個人情報なので、穴を塞ぐのが先。
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
-- 1. トレーナーコードの列
--
-- 保存は数字12桁に正規化する。表示の `1234 5678 9012` は見せ方の問題で、
-- 空白を含めて保存すると突き合わせも検索もできなくなる。
-- ---------------------------------------------------------------------------

ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS pokemon_go_friend_code text,
  ADD COLUMN IF NOT EXISTS pokemon_go_friend_note text,
  ADD COLUMN IF NOT EXISTS pokemon_go_friend_open boolean NOT NULL DEFAULT false;

ALTER TABLE public.app_user
  DROP CONSTRAINT IF EXISTS app_user_pokemon_go_friend_code_format;
ALTER TABLE public.app_user
  ADD CONSTRAINT app_user_pokemon_go_friend_code_format
  CHECK (pokemon_go_friend_code IS NULL OR pokemon_go_friend_code ~ '^[0-9]{12}$');

ALTER TABLE public.app_user
  DROP CONSTRAINT IF EXISTS app_user_pokemon_go_friend_note_length;
ALTER TABLE public.app_user
  ADD CONSTRAINT app_user_pokemon_go_friend_note_length
  CHECK (pokemon_go_friend_note IS NULL OR char_length(pokemon_go_friend_note) <= 50);

-- コードが無いのに募集中にはできない。「募集中」と出ているのに申請手段が無い状態を作らない。
ALTER TABLE public.app_user
  DROP CONSTRAINT IF EXISTS app_user_pokemon_go_friend_open_needs_code;
ALTER TABLE public.app_user
  ADD CONSTRAINT app_user_pokemon_go_friend_open_needs_code
  CHECK (NOT pokemon_go_friend_open OR pokemon_go_friend_code IS NOT NULL);

COMMENT ON COLUMN public.app_user.pokemon_go_friend_code IS
  'Pokémon GO のトレーナーコード。数字12桁に正規化して保存する（表示は 4桁区切り）。'
  ' anon / authenticated への直接 GRANT は無く、get_public_user_info() 経由でのみ公開される。';
COMMENT ON COLUMN public.app_user.pokemon_go_friend_open IS
  '「Pokémon GOフレンド募集中」の公開スイッチ。false の間はコードを公開経路に出さない。';

-- ---------------------------------------------------------------------------
-- 2. 列を名指しにする
--
-- テーブル単位の GRANT は「今ある列も、これから増える列も全部」を意味する。
-- ここを閉じておかないと、プロフィールに列を1つ足した瞬間に自動的に公開される。
-- 上で足したトレーナーコードがまさにそれに当たる。
--
-- 列ACLはテーブル単位の REVOKE では消えないので、残骸も名指しで落とす。
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.app_user FROM anon, authenticated;
REVOKE SELECT (auth_uid, display_name, avatar_url) ON public.app_user FROM anon, authenticated;
REVOKE SELECT (pokemon_go_friend_code, pokemon_go_friend_note, pokemon_go_friend_open)
  ON public.app_user FROM anon, authenticated;

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
-- 3. 行を自分のものだけにする
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
-- 4. 公開経路
--
-- 返り値の型が変わるので CREATE OR REPLACE では差し替えられない。DROP して作り直す。
-- GRANT は DROP で消えるので張り直す。
--
-- (a) 行を「公開訪問が1件以上あるユーザー」に絞る
--
--     この関数は auth_uid を返す（issue #187）。呼び出し側は公開スタンプ帳の
--     visit を引くために使っており、単純に返り値から外すと公開ページが壊れる。
--     代わりに行を絞る。auth_uid は `visit.user_id` にそのまま入っていて、
--     公開訪問の行は anon から読めるので、公開訪問を持つユーザーの auth_uid は
--     どのみち引ける。公開訪問が1件も無いユーザー（本番で 74人中 34人）の auth_uid
--     だけが、この関数を通してのみ漏れていた。そこを塞ぐ。
--     同じ条件は get_public_user_ids() が既に持っている。片方だけ抜けていた。
--
--     副作用: 公開訪問が0件のユーザーの公開ページが 404 になる。
--     表示できる公開コンテンツが無いページなので、表示名と bio だけが出ていた状態より正しい。
--     （呼び出し側は null を notFound() に落とす実装になっている）
--
--     返り値から auth_uid 自体を外すには、公開 visit の取得ごと SECURITY DEFINER 側へ
--     移す必要がある。それは別途。
--
-- (b) トレーナーコードを公開スイッチで出し分ける
--
--     なぜ列 GRANT ではなく関数か: 公開スイッチが OFF のときはコードを返してはいけない。
--     列 GRANT は「行のどの列を読めるか」しか表現できず、他の列の値による出し分けが
--     できない。API 層で隠しても anon キーの直叩きで素通りする。
--     条件付きの公開は SECURITY DEFINER の中でしか正しく書けない。
--
--     行ごと消さないのは、スイッチと無関係に表示名や bio を出す必要があるため。
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_public_user_info(uuid);

CREATE FUNCTION public.get_public_user_info(p_user_id uuid)
RETURNS TABLE(
  auth_uid uuid,
  display_name text,
  bio text,
  x_url text,
  instagram_url text,
  pokemon_go_friend_code text,
  pokemon_go_friend_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    au.auth_uid,
    au.display_name,
    au.bio,
    au.x_url,
    au.instagram_url,
    CASE WHEN au.pokemon_go_friend_open THEN au.pokemon_go_friend_code END,
    CASE WHEN au.pokemon_go_friend_open THEN au.pokemon_go_friend_note END
  FROM app_user au
  WHERE au.id = p_user_id
    AND EXISTS (
      SELECT 1 FROM visit v
      WHERE v.user_id = au.auth_uid AND v.is_public = true
    );
$function$;

REVOKE ALL ON FUNCTION public.get_public_user_info(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_public_user_info(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_public_user_info(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_user_info(uuid) TO service_role;

COMMENT ON FUNCTION public.get_public_user_info(uuid) IS
  '公開スタンプ帳の表示用。公開訪問を1件以上持つユーザーの行だけを返す。'
  ' 条件は get_public_user_ids() と揃えてある。'
  ' トレーナーコードと一言は pokemon_go_friend_open = true のときだけ値が入る（2026-08-10）。';

-- ---------------------------------------------------------------------------
-- 5. 自分のプロフィール取得
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_own_profile();

CREATE FUNCTION public.get_own_profile()
RETURNS TABLE(
  public_user_id uuid,
  display_name text,
  bio text,
  x_url text,
  instagram_url text,
  profile_is_customized boolean,
  pokemon_go_friend_code text,
  pokemon_go_friend_note text,
  pokemon_go_friend_open boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    au.id,
    au.display_name,
    au.bio,
    au.x_url,
    au.instagram_url,
    au.profile_is_customized,
    au.pokemon_go_friend_code,
    au.pokemon_go_friend_note,
    au.pokemon_go_friend_open
  FROM app_user au
  WHERE au.auth_uid = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.get_own_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_own_profile() TO anon;
GRANT ALL ON FUNCTION public.get_own_profile() TO authenticated;
GRANT ALL ON FUNCTION public.get_own_profile() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. 保存
--
-- 新しい引数には DEFAULT を付ける。マイグレーションの適用とコードのデプロイは
-- 連動していないので、**適用が先でデプロイが後**の窓では旧コードが4引数で呼ぶ。
-- DEFAULT があれば同じ関数に解決されて落ちない。
-- （2026-08-09 の事故は、この窓で存在しない列を指して INSERT が全滅したもの）
--
-- 入力の正規化と検証はここに置く。API 層は利用者向けの文言を出すためのもので、
-- 境界ではない。空白・ハイフン・全角数字を落として12桁に揃える。
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_own_public_profile(text, text, text, text);

CREATE FUNCTION public.update_own_public_profile(
  p_display_name text,
  p_bio text,
  p_x_url text,
  p_instagram_url text,
  p_pokemon_go_friend_code text DEFAULT NULL,
  p_pokemon_go_friend_note text DEFAULT NULL,
  p_pokemon_go_friend_open boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_display_name text := nullif(btrim(p_display_name), '');
  v_bio text := nullif(btrim(p_bio), '');
  v_x_url text := nullif(btrim(p_x_url), '');
  v_instagram_url text := nullif(btrim(p_instagram_url), '');
  v_go_raw text;
  v_go_code text;
  v_go_note text := nullif(btrim(p_pokemon_go_friend_note), '');
  v_go_open boolean := COALESCE(p_pokemon_go_friend_open, false);
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

  -- 全角数字を半角に寄せ、数字以外（空白・ハイフン）を落としてから検証する。
  -- 利用者はゲーム画面の `1234 5678 9012` をそのまま貼るので、そこで弾かない。
  v_go_raw := translate(COALESCE(p_pokemon_go_friend_code, ''),
                        '０１２３４５６７８９', '0123456789');

  -- ただし「数字以外を落とす」だけだと `abcd` が空文字になり、未設定として通って
  -- 保存済みのコードを消してしまう。打ち間違いで消えるのは弾かれるより悪いので、
  -- 数字と区切り以外が混ざっていたら、落とす前にここで止める。
  IF regexp_replace(v_go_raw, '[0-9[:space:]　‐–—－-]', '', 'g') <> '' THEN
    RAISE EXCEPTION 'Invalid Pokemon GO friend code';
  END IF;

  v_go_code := nullif(regexp_replace(v_go_raw, '[^0-9]', '', 'g'), '');

  IF v_go_code IS NOT NULL AND v_go_code !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'Invalid Pokemon GO friend code';
  END IF;
  IF char_length(COALESCE(v_go_note, '')) > 50 THEN
    RAISE EXCEPTION 'Pokemon GO note is too long';
  END IF;

  -- コードが無ければ募集中にはしない。CHECK 制約に任せて例外にするより、
  -- 「コードを消したら募集も止まる」ほうが利用者の意図に近い。
  IF v_go_code IS NULL THEN
    v_go_open := false;
    v_go_note := NULL;
  END IF;

  -- app_user は投稿・いいね等の初回書き込み時に遅延作成されるため、
  -- 行がまだ無いユーザーでもプロフィール保存できるよう upsert にする。
  INSERT INTO app_user (
    auth_uid, display_name, bio, x_url, instagram_url, profile_is_customized,
    pokemon_go_friend_code, pokemon_go_friend_note, pokemon_go_friend_open
  )
  VALUES (
    auth.uid(), v_display_name, v_bio, v_x_url, v_instagram_url, true,
    v_go_code, v_go_note, v_go_open
  )
  ON CONFLICT (auth_uid) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        x_url = EXCLUDED.x_url,
        instagram_url = EXCLUDED.instagram_url,
        profile_is_customized = true,
        pokemon_go_friend_code = EXCLUDED.pokemon_go_friend_code,
        pokemon_go_friend_note = EXCLUDED.pokemon_go_friend_note,
        pokemon_go_friend_open = EXCLUDED.pokemon_go_friend_open,
        updated_at = now();
END;
$_$;

REVOKE ALL ON FUNCTION public.update_own_public_profile(text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_own_public_profile(text, text, text, text, text, text, boolean) TO anon;
GRANT ALL ON FUNCTION public.update_own_public_profile(text, text, text, text, text, text, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.update_own_public_profile(text, text, text, text, text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. 公開ページの読み取り面（expand フェーズ）
--
-- 背景: 公開URLのIDは app_user.id だが、公開ページは訪問を
-- `visit.user_id = auth_uid` で絞っており、そのために get_public_user_info() が
-- auth_uid を anon へ返していた。auth_uid は内部認証IDで、公開してよいものではない。
--
-- 公開訪問を持つユーザーの auth_uid は visit 行から直接読めるため実質公開済みで、
-- 0訪問ユーザーの auth_uid だけがこの関数からしか漏れなかった。だから
-- 「公開訪問が1件以上」を関数の返却条件にして行ごと隠した。その副作用として
-- **公開訪問0件のユーザー（本番74人中34人）の公開ページが404**になっている。
--
-- 門は漏洩の後始末であって、原因ではない。原因は auth_uid を外に出す構造。
-- ここでは公開IDで直接引ける読み取り面を作り、auth_uid が DB の外へ出ない形にする。
--
-- **このマイグレーションは追加だけを行う。** 旧 get_public_user_info() も
-- visit の GRANT もそのまま残す。適用しても本番で動いている旧コードは壊れない。
-- 旧経路の閉鎖（visit の anon GRANT 剥奪・旧RPC削除）は別PRの contract フェーズ。
-- 詳細は Obsidian の
-- `dev/pokefuta/issue/2026-08-11 pokefuta 公開プロフィール面の再設計（auth_uid を外に出さない）.md`
-- ---------------------------------------------------------------------------

-- 最新写真の相関サブクエリ用。(visit_id) だけの既存インデックスでは
-- Bitmap Heap Scan + Sort になる。この複合インデックスで Index Only Scan になり、
-- 実測では進捗ページのクエリが旧方式の 6.68ms → 3.16ms と逆に速くなった。
CREATE INDEX IF NOT EXISTS idx_photo_visit_latest
  ON public.photo (visit_id, created_at DESC, id DESC);

-- 基礎ビュー: 写真を含まない。件数・都道府県集計・一覧の土台。
--
-- 写真を別ビューへ分けているのは性能のためではなく**保証**のため。
-- 1枚に相関サブクエリを持たせると、集計時にそれが実行されないことが
-- プランナ任せになる。列として存在しなければ実行されようがない。
--
-- security_invoker = false: 所有者権限で走る。app_user は anon に GRANT が無いので、
-- これでないと結合できない。**その代わり RLS を跨ぐので、WHERE v.is_public が唯一の砦**。
CREATE OR REPLACE VIEW public.public_user_visit_base
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  au.id          AS public_user_id,   -- 公開URLのID。auth_uid は列に持たない
  v.id           AS id,
  v.manhole_id   AS manhole_id,
  v.shot_at      AS shot_at,
  v.comment      AS comment,
  v.created_at   AS created_at,
  m.title        AS manhole_title,
  m.prefecture   AS manhole_prefecture,
  m.municipality AS manhole_municipality,
  m.pokemons     AS manhole_pokemons
FROM public.visit v
JOIN public.app_user au ON au.auth_uid = v.user_id
LEFT JOIN public.manhole m ON m.id = v.manhole_id
WHERE v.is_public IS TRUE;
-- 載せない列（意図的）: v.user_id（= auth_uid）, v.note（非公開メモ）,
-- v.shot_location（GPS）, v.updated_at, photo.exif。
-- 列を足すときは tools/verify-app-user-visibility.sql の列集合検査が落ちる。
-- 落ちたら「検査を直す」のではなく、その列を公開してよいか先に決めること。

-- カード用ビュー: 基礎に最新写真を1枚だけ足す。
CREATE OR REPLACE VIEW public.public_user_visit_card
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  b.*,
  (SELECT p.id
     FROM public.photo p
    WHERE p.visit_id = b.id
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 1) AS latest_photo_id
FROM public.public_user_visit_base b;

REVOKE ALL ON public.public_user_visit_base FROM PUBLIC;
REVOKE ALL ON public.public_user_visit_card FROM PUBLIC;
GRANT SELECT ON public.public_user_visit_base TO anon, authenticated, service_role;
GRANT SELECT ON public.public_user_visit_card TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_user_visit_base IS
  '公開訪問だけを公開ID(app_user.id)で引ける読み取り面。auth_uid / note / shot_location は含まない。'
  ' 所有者権限で走るため RLS を跨ぐ。WHERE is_public が唯一の砦なので、定義を変えるときは'
  ' tools/verify-app-user-visibility.sql の非公開訪問テストを必ず通すこと。';
COMMENT ON VIEW public.public_user_visit_card IS
  'public_user_visit_base に最新写真を1枚足したカード表示用。集計には base を使うこと。';

-- ---------------------------------------------------------------------------
-- 8. 公開プロフィール（auth_uid を返さない・門を持たない）
--
-- 旧 get_public_user_info() は残す。expand フェーズなので消さない。
-- 名前を _v2 にしないのは、どちらが正か後から読めなくなるため。
-- この関数は「auth_uid を持たない公開プロフィール面」を名前で説明している。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id uuid)
RETURNS TABLE(
  display_name text,
  bio text,
  x_url text,
  instagram_url text,
  pokemon_go_friend_code text,
  pokemon_go_friend_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    au.display_name,
    au.bio,
    au.x_url,
    au.instagram_url,
    -- 募集スイッチが OFF のときはコードを公開経路に出さない。
    -- API層で隠しても anon キーの直叩きで素通りするので、ここで出し分ける。
    CASE WHEN au.pokemon_go_friend_open THEN au.pokemon_go_friend_code END,
    CASE WHEN au.pokemon_go_friend_open THEN au.pokemon_go_friend_note END
  FROM app_user au
  WHERE au.id = p_user_id;
  -- 公開訪問の有無は問わない。訪問0件でもプロフィールは公開ページとして成立する。
  -- auth_uid を返さないので、門で行ごと隠す必要がそもそも無い。
$function$;

REVOKE ALL ON FUNCTION public.get_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_profile(uuid) IS
  '公開プロフィール面。auth_uid を返さず、公開訪問の有無で行を隠さない。'
  ' 訪問は public_user_visit_base / _card から公開IDで引く。'
  ' 旧 get_public_user_info() は contract フェーズで閉じるまで残す（2026-08-11）。';
