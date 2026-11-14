-- 雪のタグ（photo.ai_tags.snow）を、人が確かめた判定に揃える。watermark は 2026-11-14 の最後の人の判定（2026-11-14T05:34:37.580735+00:00）。
--
-- watermark より前に投稿された採点済みの写真は、人が「雪あり」とした 51 枚だけを snow = true、ほかを false にする。
-- 雪の判定は k11 の manhole-score の確認画面で付けたもの（AI が雪とした写真は全部人が見ている）。
-- watermark より後の投稿は、これまでどおり k11 の自動採点（AI）の値のまま。
-- 11/14 時点の公開写真では、AI の誤り 2 枚が false に、AI の見落とし 10 枚が true になり、/photos/snow は 34 枚 → 42 枚。
--
-- 変えるのは ai_tags の snow だけ。点・候補・版・採点時刻は変えないので、自動採点の楽観ロックにも影響しない。
-- photo_protect_quality_score トリガは anon / authenticated からの変更だけを戻す（マイグレーションは postgres）。
-- 注意: 採点の版を上げて全件を採点し直すと、snow は AI の値に戻る。そのときは k11 側で人の判定を優先させること。
--
-- ロールバック（変えた行は NOTICE に出る。snow を元の値に戻す）:
--   UPDATE public.photo SET ai_tags = ai_tags || jsonb_build_object('snow', <元の値>) WHERE id = '<NOTICE の id>';
DO $$
DECLARE
  v_watermark constant timestamptz := '2026-11-14T05:34:37.580735+00:00';
  v_snow constant uuid[] := ARRAY[
    '0497d096-ca74-43e2-8de7-1071f9f59e57', '0700c070-c07f-4ab7-8027-25bcb513c6af',
    '0b6e66bc-4212-4074-a89f-436084943144', '1bb476eb-9365-4b02-ad01-4094e6caf919',
    '1d156ff0-e10c-4700-a7e0-ce537b02b2ca', '1e80c02b-3de6-485b-b9a5-09a0a408f9db',
    '296f0199-5c37-43b9-8ab2-245fe85fcece', '2a296fc1-9169-42db-8b58-16c917a613ca',
    '2d4d06a6-ebaa-4dc8-b548-f4818c9184ad', '398aec9e-84ef-4b8e-ab05-9981dcceced3',
    '3aa95a34-bff0-4e77-9b26-79fe11f1631e', '3bc15d7e-e93e-4ac8-b769-9150c37f7d0a',
    '3e3812a9-790e-4fdf-8461-7bc8c283d965', '44659a72-003c-4e91-9e28-6839c3cbf943',
    '4eb6d322-24cf-4ab0-bc76-9c3047dce5ff', '579c33c4-ae8c-4900-a73d-aebd35fe9655',
    '5b22e390-ed68-4e21-b37d-c5d2b506f088', '6c2f44e1-0b89-45a5-b688-9714031a9517',
    '733b5dad-4a0f-46ff-90ab-e76c6d7ae467', '7dc2d8c6-e08e-4061-8ee5-cc304b74175e',
    '8361b473-9e9d-4417-b880-cc54741ad1bd', '836c8929-5a1c-4175-b0d5-e3f9cd08b30d',
    '838e9d1f-91a1-4a5b-be96-035c54c39bae', '89938c0c-9a36-4160-b867-219d454932aa',
    '8fe84d40-80de-4a9e-83c4-94f000b55e67', '95fa1fbd-e110-498f-aee5-a21a28806e50',
    '9eb280d2-9245-4fb2-ae80-4d691230b0ad', 'a34a3d90-5125-4502-97b1-0459055703d7',
    'a3f51c0f-b7a7-41e9-be34-368323ac4c07', 'a4dfe3bb-64b9-45f2-8b9f-92e87ce7c880',
    'a506b2ea-76ad-409b-a4ee-97b50effe4ca', 'a67c4caa-036f-4e1e-b64f-05fe2d5cdbba',
    'ab9ee63e-5dbe-4777-9464-88400bb68ba1', 'ad598cac-8e2b-4a71-9c3e-0896f56c966e',
    'b13cb88f-ffd1-4d06-8b4d-c85389e67dc9', 'b31ab35a-0be1-4f10-8e43-071a7c0f450d',
    'bd5133cc-120b-4dbb-a71e-9561bb1550d4', 'bec397e4-68ab-4386-b8dd-5d79a5072529',
    'bfd0ad61-41a7-4f84-8e55-8bd2cdd30856', 'cf56e996-1c84-45ab-b686-103317179f09',
    'd1231190-8536-4497-bf6e-d6a294ccb5c7', 'd311737c-42d3-4a43-afd5-e691a8ffbe47',
    'd8f0d8f0-568a-41a8-b1e0-8d797f13fcd5', 'd96af5e7-0855-4a33-8c4c-e72feb6ff18f',
    'e158da43-3b06-42f4-b011-738dada6e8cb', 'e33204ee-6ecb-4e68-b83e-4f41517a9b4a',
    'e4954352-12a2-411b-ae64-9a900170ae4c', 'e9376d3e-57af-4971-98e8-5a20a7567941',
    'edfffe4c-920f-4475-877c-6b65cd45c167', 'f3c2b6fb-695c-4709-b339-79bde58b5ab6',
    'f4aaeef4-849c-4c91-943c-ef3a97ff1a4b'
  ]::uuid[];
  v_row record;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT p.id, p.ai_tags -> 'snow' AS old_snow, p.id = ANY (v_snow) AS new_snow
    FROM public.photo AS p
    WHERE p.created_at <= v_watermark
      AND p.ai_tags ? 'attrs_model'   -- 雪を判定する版（0.12.0 以降）で採点済みの写真だけ
      AND (p.ai_tags -> 'snow') IS DISTINCT FROM to_jsonb(p.id = ANY (v_snow))
    ORDER BY p.id
    FOR UPDATE
  LOOP
    UPDATE public.photo
    SET ai_tags = ai_tags || jsonb_build_object('snow', v_row.new_snow)
    WHERE id = v_row.id;
    v_n := v_n + 1;
    RAISE NOTICE 'snow % -> %: %', coalesce(v_row.old_snow::text, 'なし'), v_row.new_snow, v_row.id;
  END LOOP;

  -- 11/14 の公開写真で 12 枚。非公開を足しても 51 枚の人の判定を大きく超えることはない。
  -- 桁違いに多いのは想定外（watermark や判定の取り違え）なので全体を取り消す
  IF v_n > 40 THEN
    RAISE EXCEPTION '雪のタグを % 枚も変えようとした（想定は 12 枚前後）。取り消す', v_n;
  END IF;
  RAISE NOTICE '雪のタグを % 枚、人の判定に揃えた', v_n;
END $$;
