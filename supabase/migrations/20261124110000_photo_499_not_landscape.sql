-- 下仁田（499）の初投稿の写真を「周辺の風景」から蓋の写真に戻す。
-- photo 1442b22e-4b86-4e4f-b8bb-45a7caa5b85d（visit 806d40de-441c-4b67-89ee-5134941b2639）は
-- 蓋そのものを正面から撮った写真だが、投稿時に「周辺の風景」が選ばれて is_landscape = true で
-- 保存された。風景は代表写真・写真充足率から外れるため、499 の詳細ページが「0 蓋の写真を募集中」の
-- ままになり、トップ・県ページの充足にも数えられていない。
--
-- 本番を読み取り確認済み（/api/image-upload?manhole_id=499）: 499 の写真はこの1枚だけで、
-- is_landscape = true・公開訪問。
-- 写真・訪問・蓋の組が期待どおりのときだけ直す。対象が無い DB（ローカルの db reset など）は何もしない。
-- すでに false なら何もしない（再実行しても同じ）。組が違えば例外で止める。
--
-- 戻す場合: UPDATE public.photo SET is_landscape = true
--   WHERE id = '1442b22e-4b86-4e4f-b8bb-45a7caa5b85d' AND manhole_id = 499;
DO $$
DECLARE
  p record;
BEGIN
  SELECT id, visit_id, manhole_id, is_landscape INTO p
  FROM public.photo
  WHERE id = '1442b22e-4b86-4e4f-b8bb-45a7caa5b85d'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'photo 499 not landscape: 対象の写真が無い DB なので何もしない';
    RETURN;
  END IF;

  IF p.manhole_id IS DISTINCT FROM 499
     OR p.visit_id IS DISTINCT FROM '806d40de-441c-4b67-89ee-5134941b2639'::uuid THEN
    RAISE EXCEPTION 'photo % の蓋・訪問が期待と違う（直さずに止める）', p.id;
  END IF;

  IF NOT p.is_landscape THEN
    RAISE NOTICE 'photo 499 not landscape: すでに蓋の写真なので何もしない';
    RETURN;
  END IF;

  UPDATE public.photo SET is_landscape = false WHERE id = p.id;
END
$$;
