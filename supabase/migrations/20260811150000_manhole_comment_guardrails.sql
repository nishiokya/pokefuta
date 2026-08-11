-- 蓋コメント（manhole_comment）を「主役」にする前の下ごしらえ。
--
-- 現状（2026-08-11 本番実測）: コメント6件・書いた人2人。
-- これから導線を直して件数を増やすが、**増える前にしか入れられないもの**が3つある。
--
--   1. 長さの上限        … 既存の最大は26文字。今なら CHECK が無条件に通る
--   2. 投稿レート制限    … 現状 1時間10件を超えた人は0人。今なら誰も弾かない
--   3. 通報の受け皿      … 荒れてから作ると、荒れている間だけ手段が無い
--
-- どれも「コメントが増えてから」だと、既存データとの整合を取りながら入れることになる。
--
-- 索引は足さない。スレッド取得は既存の idx_manhole_comment_manhole_id と
-- idx_manhole_comment_parent の BitmapAnd で解決しており（本番 EXPLAIN で
-- 5 buffer hit / 0.19ms）、6行の段階で複合索引の必要性は示せない。
-- このテーブルには既に索引が5本ある。必要になってから測って足すこと。

-- ---------------------------------------------------------------------------
-- 1. 本文の長さ制限を DB 側に持たせる
--
-- visit_comment には `visit_comment_content_length`（<= 1000）があるのに
-- manhole_comment には無く、1000文字の制限は API 層にしか無かった。
-- authenticated は manhole_comment に GRANT ALL を持っているので、
-- PostgREST を直叩きすれば 10MB のコメントを入れて蓋ページを全員に対して壊せる。
--
-- **API 層はセキュリティ境界ではない。** 境界は GRANT・RLS・制約だけ。
-- ---------------------------------------------------------------------------

ALTER TABLE public.manhole_comment
  ADD CONSTRAINT manhole_comment_content_length
  CHECK (char_length(content) <= 1000);

-- 空白だけの投稿も止める。API 側は JS の trim() で弾いているが、直叩きは素通りする。
--
-- `btrim(content) <> ''` にしないこと。**Postgres の btrim は既定で ASCII の空白しか落とさず、
-- 全角スペース（U+3000）だけのコメントが通り抜ける。** 日本語入力では素で起きる。
-- `[:space:]` は UTF-8 で全角スペース・タブ・改行を含むので、こちらで判定する。
-- （2026-08-11、検査 [2] が実際にこれを検出した）
ALTER TABLE public.manhole_comment
  ADD CONSTRAINT manhole_comment_content_not_blank
  CHECK (content ~ '[^[:space:]]');

-- ---------------------------------------------------------------------------
-- 2. 投稿レート制限
--
-- アカウントを1つ作れば482枚の蓋すべてに投稿できる状態を、コメントを主役にしてから
-- 気づくのでは遅い。コードベースにレート制限は1つも無い。
--
-- API 層ではなく DB 側に置く理由は 1 と同じ。加えて、コメント POST の経路は
-- すでに ensureAppUser を呼び忘れた実績がある（visit 側にはあり、蓋側には無い）。
-- 手順を増やせば忘れる。
--
-- service_role（日次同期・バックフィル）は auth.uid() が NULL になるので素通しする。
-- 制限したいのは利用者であって運用ではない。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_manhole_comment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recent integer;
BEGIN
  -- auth.uid() が NULL＝service_role やマイグレーションからの書き込み。対象外。
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_recent
  FROM manhole_comment
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '1 hour';

  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'Comment rate limit exceeded'
      USING ERRCODE = '53400',
            HINT = '1時間あたり10件までです。';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_manhole_comment_rate_limit ON public.manhole_comment;
CREATE TRIGGER enforce_manhole_comment_rate_limit
  BEFORE INSERT ON public.manhole_comment
  FOR EACH ROW EXECUTE FUNCTION public.enforce_manhole_comment_rate_limit();

COMMENT ON FUNCTION public.enforce_manhole_comment_rate_limit() IS
  '1ユーザー1時間10件。API層ではなくDB側に置く（anonキーでPostgRESTを直叩きされても効かせるため）。'
  ' service_role は auth.uid() が NULL なので対象外。';

-- ---------------------------------------------------------------------------
-- 3. 通報の受け皿
--
-- 通報ボタンを置く以上「読む」というコミットが要る。専用の管理画面は
-- コメント6件の段階では過剰なので作らない。滞留件数を週次で見る運用にする。
--
-- 読めるのは service_role だけ。anon にも authenticated にも SELECT を与えない。
-- 「誰が誰を通報したか」は通報者を晒す情報で、公開面に出す理由が無い。
--
-- GRANT は列名指し。テーブル単位にすると、あとで列を足した瞬間に自動で開く。
-- photo.exif が漏れたのはまさにその形だった。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.comment_report (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id        uuid NOT NULL REFERENCES public.manhole_comment(id) ON DELETE CASCADE,
  reporter_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason            text,
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at       timestamp with time zone,
  CONSTRAINT comment_report_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500)
);

-- 同じ人が同じコメントを何度も通報しても1件。連打で滞留件数が膨らむのを防ぐ。
CREATE UNIQUE INDEX IF NOT EXISTS comment_report_unique_reporter
  ON public.comment_report (comment_id, reporter_user_id)
  WHERE reporter_user_id IS NOT NULL;

-- 未処理の通報を拾うための索引。運用で毎週叩くのはこの並び。
CREATE INDEX IF NOT EXISTS comment_report_unresolved
  ON public.comment_report (created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.comment_report ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.comment_report FROM PUBLIC, anon, authenticated;
GRANT INSERT (comment_id, reporter_user_id, reason) ON public.comment_report TO authenticated;

-- 自分の名前でしか通報できない。他人になりすました通報を作らせない。
DROP POLICY IF EXISTS users_insert_own_reports ON public.comment_report;
CREATE POLICY users_insert_own_reports ON public.comment_report
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_user_id);

-- SELECT ポリシーは意図的に作らない。service_role は RLS を迂回するので運用は読める。
--
-- **アプリ側は通報の INSERT に `.select()` を付けないこと。**
-- SELECT ポリシーが無いので `INSERT ... RETURNING` は 42501 で落ちる
-- （photo.exif で踏んだのと同じ形）。通報は書き込み専用で、返す値は無い。
-- tools/verify-comment-guardrails.sql の [5] がこれを固定している。
COMMENT ON TABLE public.comment_report IS
  '蓋コメントの通報。読めるのは service_role のみ（SELECTポリシーを作っていない）。'
  ' 滞留件数は週次で確認する運用。専用の管理画面は作っていない。';

-- ---------------------------------------------------------------------------
-- 4. get_public_user_ids のゲートを get_public_display_names に揃える
--
-- 現状の非対称:
--   get_public_display_names … 公開visitあり **OR** 蓋コメントあり → 表示名を返す
--   get_public_user_ids      … 公開visitあり のみ                  → 公開IDを返す
--
-- つまり**コメントしかしていない人は、名前は出るのにプロフィールへリンクできない**。
-- コメントを主役にすると、この人たちが増える。
--
-- app_user.id はそもそも公開URL用のIDとして設計されたものなので、これは
-- 露出の拡大ではなく整合の回復。名前が出る条件と、その名前がどこへ繋がるかの
-- 条件が違うほうが説明できない。
-- ---------------------------------------------------------------------------

-- 揃える相手の側にも欠陥があるので同時に直す。
--
-- get_public_display_names は `RETURN QUERY` を2回実行する plpgsql で、2本目が
-- `to_regclass('public.manhole_comment') IS NOT NULL` で囲った動的 EXECUTE になっている。
-- **2本は加算されるので、公開visitがあり かつ 蓋コメントもある人は2行返る。**
--
-- 今は loadPublicDisplayNameMap が Map に入れるので重複が潰れて表面化しないが、
-- コメントを増やすのがこのプロジェクトの目的なので、重複する人は増える一方になる。
-- 件数を数える利用者が現れたら黙って間違える。
--
-- to_regclass のガードは manhole_comment がまだ存在しなかった頃（archive/023）の名残で、
-- 現在このテーブルは baseline にある。動的 SQL をやめて1本の OR にまとめる。
CREATE OR REPLACE FUNCTION public.get_public_display_names(p_auth_uids uuid[])
RETURNS TABLE(auth_uid uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT au.auth_uid, au.display_name
  FROM app_user au
  WHERE au.auth_uid = ANY(p_auth_uids)
    AND (
      au.auth_uid = auth.uid()
      OR EXISTS (
        SELECT 1 FROM visit v
        WHERE v.user_id = au.auth_uid AND v.is_public = true
      )
      OR EXISTS (
        SELECT 1 FROM visit_comment vc
        JOIN visit v ON v.id = vc.visit_id
        WHERE vc.user_id = au.auth_uid AND v.is_public = true
      )
      OR EXISTS (
        SELECT 1 FROM manhole_comment mc
        WHERE mc.user_id = au.auth_uid
      )
    );
$function$;

COMMENT ON FUNCTION public.get_public_display_names(uuid[]) IS
  '公開表示名。条件は get_public_user_ids と同じに保つこと（片方だけ変えると'
  '「名前は出るのにリンクできない」非対称が復活する）。1 uid につき必ず1行。';

CREATE OR REPLACE FUNCTION public.get_public_user_ids(p_auth_uids uuid[])
RETURNS TABLE(auth_uid uuid, public_user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT au.auth_uid, au.id
  FROM app_user au
  WHERE au.auth_uid = ANY(p_auth_uids)
    AND (
      EXISTS (
        SELECT 1 FROM visit v
        WHERE v.user_id = au.auth_uid AND v.is_public = true
      )
      OR EXISTS (
        SELECT 1 FROM manhole_comment mc
        WHERE mc.user_id = au.auth_uid
      )
    );
$function$;

COMMENT ON FUNCTION public.get_public_user_ids(uuid[]) IS
  '公開IDを返す条件は get_public_display_names と同じ（公開visitあり OR 蓋コメントあり）。'
  ' 名前が出る条件と、その名前のリンク先が出る条件を揃えている。片方だけ変えないこと。';
