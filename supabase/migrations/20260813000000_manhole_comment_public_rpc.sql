-- 蓋コメントを「auth uid を配らずに読める」形にする（Phase 1c-a）。
--
-- #215 で蓋コメント欄を482枚すべて未ログインに公開した。API のレスポンスからは
-- auth uid を消した（`PublicManholeComment`）が、**DB は開いたまま**:
--
--   GRANT ALL ON manhole_comment TO anon        （baseline 4154行）
--   public_select_manhole_comments USING (true) （baseline 1379行）
--
-- つまり公開 anon キーで `manhole_comment?select=user_id` を直接叩けば、
-- 全コメント投稿者の auth uid が今も取れる。**API 層はセキュリティ境界ではない。**
--
-- 塞ぐ順序は動かせない（3デプロイ）:
--
--   1c-a  このファイル。読み口の RPC を足す。加算のみ・可逆
--   1c-b  アプリを RPC 経由に切り替えてデプロイ
--   1c-c  manhole_comment の SELECT を列名指しにする（user_id を含めない）
--
-- `REVOKE` を先に打つと、まだ user_id を読んでいる本番のコードが 42501 で全滅する。
-- 列を剥がせるのは「読まなくなったコードが本番で動いている」ことを確認したあと。
--
-- **1c-c は `REVOKE SELECT (user_id)` ではない。** 計画ファイルにはそう書いてあるが、
-- Postgres の列単位 REVOKE はテーブル単位の GRANT を削らないので、
-- `GRANT ALL ON manhole_comment TO anon` が残っている限り user_id は読めたままになる。
-- photo と同じ形（20260810120000）で書くこと:
--
--   REVOKE SELECT ON public.manhole_comment FROM anon, authenticated;
--   GRANT SELECT (id, manhole_id, parent_comment_id, content,
--                 is_edited, edited_at, created_at, updated_at)
--     ON public.manhole_comment TO anon, authenticated;
--
-- INSERT/UPDATE/DELETE のテーブル単位 GRANT は触らない（投稿と自己削除に要る）。
-- この形が本当に成立することは tools/verify-comment-guardrails.sql [9] が
-- **実際にロールを切り替えて予行演習**して確かめている。
--
-- 計画: ~/.claude/plans/seo-sns-ux-mutable-simon.md §Phase 1c
--
-- ---------------------------------------------------------------------------
-- ⚠️ 1c-c を打つ前に片付けること（このファイルでは触らない）
--
-- `manhole_comment_stats` は `security_invoker=on` のビューで、定義に
-- `count(DISTINCT user_id)` を持つ（baseline 619行）。security_invoker は
-- **呼び出し側の権限で評価する**ので、1c-c で anon から user_id の SELECT を剥がすと
-- このビューは anon にとって 42501 になる。
--
-- 現在このビューを読んでいるコードは無い（アプリ・tools・tests とも参照ゼロ）ので
-- 実害は出ていないが、**Phase 3 で「コメント件数の表示」に使う予定**なので、
-- 1c-c と同時に決着させること。選択肢は (a) ビューを security_invoker=off にする
-- （manhole_comment の SELECT ポリシーは USING(true) なので RLS 上の意味は変わらない）、
-- (b) commenter_count を落とす、(c) 件数も RPC にする。
-- **1c-c を「REVOKE 1行」だと思って打つと、Phase 3 で初めて壊れているのが見つかる。**
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- get_manhole_comments — 蓋のスレッド1ページ分を、公開してよい形だけで返す
--
-- **user_id を返さないことがこの関数の存在理由。** SECURITY DEFINER なので
-- 1c-c で呼び出しロールから user_id の SELECT を剥がしたあとも動く。
-- 逆に言うと、ここに user_id を足した瞬間に 1c 全体が無意味になる。
--
-- 表示名と public_user_id は既存の get_public_display_names / get_public_user_ids に
-- 委ねる。**公開条件（公開visit / 公開visitへのコメント / 蓋コメント の3分岐）を
-- ここに再実装しないこと。** 条件を2箇所に持つと必ず片方だけ変わる
-- （20260811150000 で直したのがまさにその非対称）。
--
-- 引数の意味:
--   p_limit             返す行数。**呼び出し側が has_more 判定のため +1 して渡す**
--                       前提なので、上限は 101（アプリ側の limit 上限 100 + 1）
--   p_offset            カーソル未指定のときだけ効く（初回ページ以外では使っていない）
--   p_before_created_at / p_before_id
--                       この (created_at, id) より古いものを返す。新しい順のリストは
--                       先頭が動くので、続きは offset ではなくカーソルで取る
--                       （offset だと取得中に新着が入るたび境界がずれて重複・欠落する）
--
-- 返す thread_total はカーソルに関係なく**スレッド全体の件数**。
-- PostgREST の `count: 'exact'` はフィルタ後の件数なので、カーソル付きだと
-- 「そのカーソルより古い件数」になり見出しが壊れていた（route.ts が null を返して
-- 回避している）。RPC 側は素直に全体を数えられるので、その回避は要らなくなる。
-- ただし 1c-b では API の契約を変えない（カーソル付きの total は null のまま返す）。
--
-- 返り値に user_id が無いことは tools/verify-comment-guardrails.sql [9] が固定する。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_manhole_comments(
  p_manhole_id integer,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_before_created_at timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  manhole_id integer,
  parent_comment_id uuid,
  content text,
  created_at timestamp with time zone,
  is_own boolean,
  display_name text,
  public_user_id uuid,
  thread_total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH page AS (
    SELECT mc.id, mc.manhole_id, mc.parent_comment_id, mc.content, mc.created_at, mc.user_id
    FROM manhole_comment mc
    WHERE mc.manhole_id = p_manhole_id
      -- 返信はまだ出さない（親だけ）。返信UIは通知と同時（Phase 4）。
      AND mc.parent_comment_id IS NULL
      AND (
        p_before_created_at IS NULL
        OR mc.created_at < p_before_created_at
        -- created_at が同値の行は id で決める（同時刻の投稿で境界が壊れないように）
        OR (p_before_id IS NOT NULL
            AND mc.created_at = p_before_created_at
            AND mc.id < p_before_id)
      )
    ORDER BY mc.created_at DESC, mc.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 101)
    -- カーソルと offset を併用しない。カーソルがあるなら起点はカーソルだけ。
    OFFSET CASE WHEN p_before_created_at IS NULL
                THEN GREATEST(COALESCE(p_offset, 0), 0)
                ELSE 0 END
  ),
  uids AS (
    SELECT COALESCE(array_agg(DISTINCT p.user_id), '{}'::uuid[]) AS arr FROM page p
  ),
  names AS (
    SELECT n.auth_uid, n.display_name
    FROM uids, LATERAL get_public_display_names(uids.arr) n
  ),
  ids AS (
    SELECT i.auth_uid, i.public_user_id
    FROM uids, LATERAL get_public_user_ids(uids.arr) i
  ),
  total AS (
    SELECT count(*) AS c
    FROM manhole_comment mc
    WHERE mc.manhole_id = p_manhole_id AND mc.parent_comment_id IS NULL
  )
  SELECT
    p.id,
    p.manhole_id,
    p.parent_comment_id,
    p.content,
    p.created_at,
    -- 「自分のコメントか」は uid を配って突き合わせるのではなく、サーバが答える。
    -- auth.uid() は SECURITY DEFINER の中でも呼び出し側の JWT を見る（実行ロールが
    -- 変わるだけで request.jwt.claims は変わらない）。未ログインなら false。
    (auth.uid() IS NOT NULL AND p.user_id = auth.uid()) AS is_own,
    n.display_name,
    i.public_user_id,
    t.c AS thread_total
  FROM page p
  LEFT JOIN names n ON n.auth_uid = p.user_id
  LEFT JOIN ids i ON i.auth_uid = p.user_id
  CROSS JOIN total t
  ORDER BY p.created_at DESC, p.id DESC;
$function$;

COMMENT ON FUNCTION public.get_manhole_comments(integer, integer, integer, timestamp with time zone, uuid) IS
  '蓋コメント1ページ分の公開表現。**user_id（auth uid）を返さないことが存在理由**で、'
  '1c-c で REVOKE SELECT (user_id) を打ったあとも動くように SECURITY DEFINER にしてある。'
  ' 表示名・公開IDの公開条件は get_public_display_names / get_public_user_ids に委ねる'
  '（条件をここへ再実装しないこと）。p_limit は has_more 判定の +1 込みで上限101。';

REVOKE ALL ON FUNCTION public.get_manhole_comments(integer, integer, integer, timestamp with time zone, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_manhole_comments(integer, integer, integer, timestamp with time zone, uuid) TO anon, authenticated, service_role;
