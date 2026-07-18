-- manhole の prefecture_id / prefecture_code / region を補完する
-- （database/migrations/006_extend_manhole_fields.sql のバックフィルと同じロジック）

UPDATE public.manhole m
SET prefecture_id = p.id
FROM public.prefecture p
WHERE m.prefecture = p.name AND m.prefecture_id IS NULL;

UPDATE public.manhole m
SET prefecture_code = p.code
FROM public.prefecture p
WHERE m.prefecture_id = p.id AND m.prefecture_code IS NULL;

UPDATE public.manhole SET region = '北海道' WHERE region IS NULL AND prefecture_code = '01';
UPDATE public.manhole SET region = '東北' WHERE region IS NULL AND prefecture_code IN ('02', '03', '04', '05', '06', '07');
UPDATE public.manhole SET region = '関東' WHERE region IS NULL AND prefecture_code IN ('08', '09', '10', '11', '12', '13', '14');
UPDATE public.manhole SET region = '中部' WHERE region IS NULL AND prefecture_code IN ('15', '16', '17', '18', '19', '20', '21', '22', '23');
UPDATE public.manhole SET region = '関西' WHERE region IS NULL AND prefecture_code IN ('24', '25', '26', '27', '28', '29', '30');
UPDATE public.manhole SET region = '中国' WHERE region IS NULL AND prefecture_code IN ('31', '32', '33', '34', '35');
UPDATE public.manhole SET region = '四国' WHERE region IS NULL AND prefecture_code IN ('36', '37', '38', '39');
UPDATE public.manhole SET region = '九州沖縄' WHERE region IS NULL AND prefecture_code IN ('40', '41', '42', '43', '44', '45', '46', '47');
