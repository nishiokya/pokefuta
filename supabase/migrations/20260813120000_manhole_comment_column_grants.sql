-- 蓋コメントの投稿者 auth uid を DB 側で閉じる（Phase 1c-c・最後）。
--
-- ここまでの2手:
--   1c-a  #216  `get_manhole_comments()`（SECURITY DEFINER）を足した。本番適用済み
--   1c-b  #217  アプリの読み口を RPC に移し、`manhole_comment.user_id` を
--               1箇所も読まなくした。**本番で動いていることを確認してから**このファイルを適用する
--
-- 順序を守る理由: 列を先に剥がすと、まだ user_id を読んでいる本番のコードが
-- 42501 で全滅する。API 層は PostgREST のエラーを汎用文言に丸めるので、
-- 本番画面からもログからも原因が見えない（2026-08-09 の投稿全滅と同じ構造）。
--
-- ---------------------------------------------------------------------------
-- 1. SELECT を列名指しにする
--
-- **列単位の `REVOKE SELECT (user_id)` では塞がらない。** Postgres の列単位 REVOKE は
-- 列ACLしか削らず、baseline の `GRANT ALL ON manhole_comment TO anon`（4154行）が
-- 残っている限り user_id は読めたままになる。2026-08-13 に実際に列単位 REVOKE を
-- 適用して素通りすることを確認した。photo（#211）と同じく、テーブル単位で剥がして
-- 見せてよい列を名指しで返す。
--
-- INSERT / UPDATE / DELETE のテーブル単位 GRANT は触らない。投稿は user_id を
-- 書き込む必要があり、自己削除・自己更新の RLS ポリシー式も user_id を見る
-- （ポリシー式の評価に列の SELECT 権限は要らないことは検査で実測している）。
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.manhole_comment FROM anon, authenticated;

GRANT SELECT (
  id,
  manhole_id,
  parent_comment_id,
  content,
  is_edited,
  edited_at,
  created_at,
  updated_at
) ON public.manhole_comment TO anon, authenticated;

-- user_id は意図的に含めない。**これがこの3デプロイの目的。**
-- 「自分のコメントか」は `is_own_manhole_comment()`、一覧は `get_manhole_comments()`。
-- どちらも SECURITY DEFINER なので呼び出し側の列権限に依らない。
-- アプリが user_id を読みに戻る退行は tools/check-manhole-comment-user-id.js が止める。

COMMENT ON COLUMN public.manhole_comment.user_id IS
  '投稿者の auth uid。anon / authenticated には SELECT を与えていない（Phase 1c-c）。'
  ' 公開面へ出すのは display_name と public_user_id だけで、解決は'
  ' get_public_display_names / get_public_user_ids に閉じる。';

-- ---------------------------------------------------------------------------
-- 2. manhole_comment_stats を巻き添えから外す
--
-- このビューは `security_invoker=on`（baseline 619行）で、定義に
-- `count(DISTINCT user_id)` を持つ。security_invoker は**呼び出し側の権限で
-- 評価する**ので、上の GRANT 張り替えだけを適用すると anon から 42501 になる。
-- 2026-08-13 に実際に張り替えて壊れることを実測した。
--
-- 現在このビューを読んでいるコードは**両リポジトリとも0箇所**（pokefuta /
-- pokefuta-tracker を全文検索して確認）。Phase 3 で「コメント件数の表示」に
-- 使う予定があるのは `comment_count` のほうで、`commenter_count` に予定は無い。
--
-- 3案のうち「commenter_count を落とす」を採った:
--
--   (a) security_invoker=off にする … 一番小さい変更だが、ビューが RLS を迂回する側に回る。
--       いまは SELECT ポリシーが USING (true) なので差は出ないが、あとで
--       「通報されたコメントを隠す」等のポリシーを足したとき、**隠した行が件数に
--       残る**（しかも誰も気づかない）。将来の失敗の仕込みになるので採らない
--   (b) commenter_count を落とす ← **これ**。invoker のまま、露出も増えない。
--       消費者ゼロなので互換の問題も無い
--   (c) 件数も RPC にする … Phase 3 で必要になったらでよい。今やると使われない口が増える
--
-- 「何人が話しているか」が必要になったら、SECURITY DEFINER の関数か、
-- user_id を持たない集計テーブルで出すこと。**このビューに戻さない。**
--
-- `CREATE OR REPLACE VIEW` は列を減らせないので作り直す。GRANT も張り直す
-- （DROP で消えるため）。baseline は GRANT ALL だったが、集計ビューは書けないので
-- SELECT だけにする。
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.manhole_comment_stats;

CREATE VIEW public.manhole_comment_stats WITH (security_invoker = on) AS
  SELECT manhole_id,
         count(*) AS comment_count
  FROM public.manhole_comment
  WHERE parent_comment_id IS NULL
  GROUP BY manhole_id;

ALTER VIEW public.manhole_comment_stats OWNER TO postgres;

GRANT SELECT ON public.manhole_comment_stats TO anon, authenticated, service_role;

COMMENT ON VIEW public.manhole_comment_stats IS
  '蓋ごとの親コメント件数。security_invoker のまま保つこと。'
  ' commenter_count（count(DISTINCT user_id)）は Phase 1c-c で外した —'
  ' user_id は anon / authenticated から SELECT できないので、invoker のビューで'
  ' 参照すると 42501 で丸ごと読めなくなる。人数が必要なら SECURITY DEFINER 側で出す。';
