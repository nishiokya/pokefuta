-- 未掲載ポケふた（20261031150000_provisional_pokefuta.sql）を取り下げる。
--
-- 仮ポケふた用の別の表・公開 RPC・運営ロールは、オーナーの考えていた形（写真の GPS から場所を作る、
-- 運営の手作業なし）と違っていた。新しいポケふたの投稿は既存のデザインふた投稿（design_manhole）に
-- 印を足して受ける。受付は一度も開いていないので、行は無いはず。行があれば消さずに止まる。

DO $$
DECLARE
  t text;
  has_rows boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['provisional_manhole', 'provisional_photo', 'provisional_location_hint', 'provisional_report'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', t) INTO has_rows;
      IF has_rows THEN
        RAISE EXCEPTION '未掲載ポケふたの表 % に行がある。取り下げる前に中身を確かめること', t;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS
  public.provisional_submit_photo(uuid, uuid, text, integer, text, text, integer, integer, integer, text, timestamptz, double precision, double precision, text),
  public.provisional_add_hint(uuid, double precision, double precision, text, text, text),
  public.provisional_report_target(text, uuid, text),
  public.provisional_withdraw_photo(uuid),
  public.provisional_my_photos(),
  public.provisional_list(),
  public.provisional_detail(uuid),
  public.provisional_photo_key(uuid),
  public.provisional_is_accepting();

-- 運営の関数・操作ログ・require_* はスキーマごと消す
DROP SCHEMA IF EXISTS provisional_ops CASCADE;

DROP TABLE IF EXISTS
  public.provisional_report,
  public.provisional_location_hint,
  public.provisional_photo,
  public.provisional_manhole,
  public.provisional_setting;

-- ロールに付けた権限は上で対象ごと消えている。パスワードは設定前（NULL）
DROP ROLE IF EXISTS provisional_operator;
