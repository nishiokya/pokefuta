-- デザインマンホールの投稿を、スタンプ帳（/visits・/users/<公開ID>/visits）につなぐ読み取り面。
--
-- design_manhole.created_by（auth uid）は列権限で anon / authenticated に読ませていない。
-- スタンプ帳側が必要なのは「何枚投稿したか」と「投稿者の公開ID」だけなので、
-- auth uid を外へ出さず、結果だけを返す関数で閉じる。

-- 1. 公開スタンプ帳のステッカー用: 公開ID(app_user.id)の人が公開した投稿の枚数。
--    hidden / needs_review は数えない（ページに出ない投稿をステッカーの根拠にしない）。
CREATE OR REPLACE FUNCTION public.get_public_design_manhole_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM design_manhole d
  JOIN app_user au ON au.auth_uid = d.created_by
  WHERE au.id = p_user_id
    AND d.status = 'published';
$function$;

REVOKE ALL ON FUNCTION public.get_public_design_manhole_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_design_manhole_count(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_design_manhole_count(uuid) IS
  '公開IDの人が公開(published)したデザインマンホールの枚数。auth_uid は返さない。'
  ' 公開スタンプ帳のステッカー用。';

-- 2. 自分のスタンプ帳のステッカー用: 自分の投稿の枚数。
--    本人には needs_review（近くに公式のポケふたがあり確認待ち）も見えているが、
--    ステッカーは公開されたものだけで数え、公開側の枚数と食い違わないようにする。
CREATE OR REPLACE FUNCTION public.get_own_design_manhole_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM design_manhole d
  WHERE d.created_by = auth.uid()
    AND d.status = 'published';
$function$;

REVOKE ALL ON FUNCTION public.get_own_design_manhole_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_own_design_manhole_count() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_own_design_manhole_count() IS
  '自分が公開(published)したデザインマンホールの枚数。anon には渡さない（auth.uid() が無い）。';

-- 3. デザインマンホール詳細の投稿者 → その人の公開スタンプ帳へのリンク用。
--    公開IDを返す条件は get_public_user_ids と同じ（そのまま呼ぶ）ので、
--    コメント欄の名前リンクと「リンクできる人」が食い違わない。
--    公開された活動の無い人（誰にも見せていない人）には NULL を返し、リンクを出さない。
CREATE OR REPLACE FUNCTION public.get_design_manhole_submitter_public_id(p_design_manhole_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT g.public_user_id
  FROM design_manhole d
  CROSS JOIN LATERAL public.get_public_user_ids(ARRAY[d.created_by]) g
  WHERE d.id = p_design_manhole_id
    AND d.status = 'published';
$function$;

REVOKE ALL ON FUNCTION public.get_design_manhole_submitter_public_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_design_manhole_submitter_public_id(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_design_manhole_submitter_public_id(uuid) IS
  '公開(published)のデザインマンホールの投稿者の公開ID。公開に値する活動が無ければ NULL。'
  ' 条件は get_public_user_ids に委ねる（ここで複製しない）。auth_uid は返さない。';
