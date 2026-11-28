-- 雪のタグ（photo.ai_tags.snow）を、人が確かめた判定に揃える（20261114120000_snow_tags_from_human_labels.sql の追いかけ）。
--
-- 1. 11/14 の人の判定に押し間違いが 1 枚あった。雪の写っていない夜の写真に「雪あり」が付き、
--    11/14 のマイグレーションでそのまま snow = true になって雪の一覧に出ていた。写真を見て雪が無いことを確かめたので false にする。
-- 2. 11/14 の watermark より後は自動採点（AI）の値のままで、人の判定が本番に届く道が無い。
--    11/28 時点で、人が「雪あり」とし AI が「なし」だった公開写真が 7 枚ある。写真を見て雪があることを確かめたので true にする。
--    人が「なし」・AI が「あり」の食い違いは 0 枚。
--
-- 変えるのは ai_tags の snow だけ。点・候補・版・採点時刻は変えないので、自動採点の楽観ロックにも影響しない。
-- photo_protect_quality_score トリガは anon / authenticated からの変更だけを戻す（マイグレーションは postgres）。
-- 雪ふたステッカー（get_own_snow_visit_count / get_public_snow_visit_count）は ai_tags.snow で数えるので、
-- 1 の投稿者はステッカーが消え（雪の訪問はこの 1 件だけ）、2 の投稿者のうち 3 人は新しく得る。
--
-- ロールバック（変えた行は NOTICE に出る。snow を元の値に戻す）:
--   UPDATE public.photo SET ai_tags = ai_tags || jsonb_build_object('snow', <元の値>) WHERE id = '<NOTICE の id>';
DO $$
DECLARE
  v_fix constant jsonb := jsonb_build_object(
    '2a296fc1-9169-42db-8b58-16c917a613ca', false,
    '4c6e357c-ff54-4af8-bbbb-f509a883b354', true,
    '98c29bc0-1ef1-4bf0-b055-09d46f650c85', true,
    '590b8391-6f27-4f94-b0e5-c0b4f9bfb075', true,
    '691527b2-0ce2-401f-8fe4-c23ccb071e1b', true,
    'ea8741c5-9208-4d7c-8338-8403bcb20605', true,
    '2df4420e-e8b6-46b4-a643-9f293c6881d5', true,
    '19b49d38-eff4-48df-87f6-dc349f9a5ebc', true
  );
  v_row record;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT p.id, p.ai_tags -> 'snow' AS old_snow, v_fix -> p.id::text AS new_snow
    FROM public.photo AS p
    WHERE v_fix ? p.id::text
      AND p.ai_tags ? 'attrs_model'   -- 雪を判定する版（0.12.0 以降）で採点済みの写真だけ
      AND (p.ai_tags -> 'snow') IS DISTINCT FROM (v_fix -> p.id::text)
    ORDER BY p.id
    FOR UPDATE
  LOOP
    UPDATE public.photo
    SET ai_tags = ai_tags || jsonb_build_object('snow', v_row.new_snow)
    WHERE id = v_row.id;
    v_n := v_n + 1;
    RAISE NOTICE 'snow % -> %: %', coalesce(v_row.old_snow::text, 'なし'), v_row.new_snow, v_row.id;
  END LOOP;

  -- 一覧に挙げた 8 枚より多く変わることは無い
  IF v_n > 8 THEN
    RAISE EXCEPTION '雪のタグを % 枚も変えようとした（想定は 8 枚まで）。取り消す', v_n;
  END IF;
  RAISE NOTICE '雪のタグを % 枚、人の判定に揃えた', v_n;
END $$;
