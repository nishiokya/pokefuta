-- 公式サイト（local.pokemon.jp）に新しく載ったポケふた 487〜500 の 14 枚を manhole に入れる。
--
-- 2026-11-09。公式は 10/31〜11/8 に 503 で止まっていて、その前後に載った
--   487〜490 沖縄（国頭・大宜味・東・北大東）
--   491〜495 高知第4弾（土佐・四万十・芸西・いの・佐川）
--   496〜500 群馬（沼田・館林・渋川・下仁田・長野原）
-- が写真館の manhole に無かった（本番は 486 まで）。中身は図鑑の docs/pokefuta.ndjson から
-- tools/generate_manhole_sql.py --min-id 487 --max-id 500 で作った INSERT（DDL は除いた）。
--
-- * すでにある番号は上書きしない（ON CONFLICT DO NOTHING）
-- * 館林（497、11/15 設置予定）と下仁田（499、11月下旬設置予定）も、これまでの設置予定の蓋と同じく入れる
-- * prefecture_id / region は tools/migrate_manhole_prefecture_ids.sql と同じ規則で、この 14 行だけ埋める
-- * INSERT のたびに trigger_update_badges_on_manhole_add が沖縄・高知の都道府県バッジを outdated にする
--   （新しい蓋が増えた県の制覇を「また行ける」に戻す、これまでどおりの動き）
--
-- ロールバック（visit / photo が付く前に限る）:
--   DELETE FROM public.manhole WHERE id BETWEEN 487 AND 500
--     AND NOT EXISTS (SELECT 1 FROM public.visit v WHERE v.manhole_id = manhole.id);
--   ※バッジの outdated は戻らない

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  487,
  '沖縄県/国頭村',
  '沖縄県',
  '47',
  '国頭',
  '沖縄県国頭村辺戸９３７',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(128.264718 26.87221)'),
  ARRAY['ガーディ', 'ルナアーラ'],
  'https://local.pokemon.jp/manhole/desc/487/?is_modal=1',
  '/municipality/okinawa/',
  '/municipality/okinawa/',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"ルナアーラは全国でここだけ","priority":90},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"国頭で唯一のポケふた","priority":60}]'::jsonb,
  ARRAY['#激レアポケふた', '#ご当地ポケふた'],
  ARRAY['unique_pokemon', 'only_in_city'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  488,
  '沖縄県/大宜味村',
  '沖縄県',
  '47',
  '大宜味',
  '沖縄県大宜味村津波95番地',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(128.101938 26.661031)'),
  ARRAY['ガーディ', 'ヤヤコマ'],
  'https://local.pokemon.jp/manhole/desc/488/?is_modal=1',
  '/municipality/okinawa/',
  '/municipality/okinawa/',
  '[{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"大宜味で唯一のポケふた","priority":60}]'::jsonb,
  ARRAY['#ご当地ポケふた'],
  ARRAY['only_in_city'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  489,
  '沖縄県/東村',
  '沖縄県',
  '47',
  '東',
  '沖縄県東村平良550-23',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(128.153484 26.631012)'),
  ARRAY['ガーディ', 'グレッグル', 'ニョロトノ'],
  'https://local.pokemon.jp/manhole/desc/489/?is_modal=1',
  '/municipality/okinawa/',
  '/municipality/okinawa/',
  '[{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"東で唯一のポケふた","priority":60}]'::jsonb,
  ARRAY['#ご当地ポケふた'],
  ARRAY['only_in_city'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  490,
  '沖縄県/北大東村',
  '沖縄県',
  '47',
  '北大東',
  '沖縄県北大東村南',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(131.327837 25.944616)'),
  ARRAY['ガーディ', 'ソルガレオ'],
  'https://local.pokemon.jp/manhole/desc/490/?is_modal=1',
  '/municipality/okinawa/',
  '/municipality/okinawa/',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"ソルガレオは全国でここだけ","priority":90},{"emoji":"🏝","hashtag":"#秘境ポケふた","key":"lone_100","label":"ぽつんと一枚（100km圏に他なし）","priority":75},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"北大東で唯一のポケふた","priority":60}]'::jsonb,
  ARRAY['#激レアポケふた', '#秘境ポケふた', '#ご当地ポケふた'],
  ARRAY['unique_pokemon', 'lone_100', 'only_in_city'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  491,
  '高知県/土佐市',
  '高知県',
  '39',
  '土佐',
  '高知県土佐市高岡町甲2017-1',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(133.425551 33.495986)'),
  ARRAY['ジジーロン', 'ヌオー'],
  'https://local.pokemon.jp/manhole/desc/491/?is_modal=1',
  '/municipality/kochi/',
  '/municipality/kochi/',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"ジジーロンは全国でここだけ","priority":90},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"土佐で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#激レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['unique_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  492,
  '高知県/四万十市',
  '高知県',
  '39',
  '四万十',
  '高知県四万十市駅前町8-3',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(132.944202 32.984011)'),
  ARRAY['ヌオー', 'メガヤンマ'],
  'https://local.pokemon.jp/manhole/desc/492/?is_modal=1',
  '/municipality/kochi/',
  '/municipality/kochi/',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"メガヤンマは全国でここだけ","priority":90},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"四万十で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#激レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['unique_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  493,
  '高知県/芸西村',
  '高知県',
  '39',
  '芸西',
  '高知県芸西村和食甲４５１',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(133.800235 33.519002)'),
  ARRAY['ヌオー', 'ピッピ', 'フラエッテ'],
  'https://local.pokemon.jp/manhole/desc/493/?is_modal=1',
  '/municipality/kochi/',
  '/municipality/kochi/',
  '[{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"芸西で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  494,
  '高知県/いの町',
  '高知県',
  '39',
  'いの',
  '高知県いの町新町（JR伊野駅ロータリー）',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(133.4302173 33.547787)'),
  ARRAY['ウパー', 'ヌオー'],
  'https://local.pokemon.jp/manhole/desc/494/?is_modal=1',
  '/municipality/kochi/',
  '/municipality/kochi/',
  '[{"emoji":"🌟","hashtag":"#レアポケふた","key":"rare_pokemon","label":"レアポケふた（全国3枚）","priority":70},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"いので唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['rare_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  495,
  '高知県/佐川町',
  '高知県',
  '39',
  '佐川',
  '高知県佐川町加茂2711-1',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(133.317008 33.503128)'),
  ARRAY['ゾウドウ', 'ヌオー', 'ポポッコ'],
  'https://local.pokemon.jp/manhole/desc/495/?is_modal=1',
  '/municipality/kochi/',
  '/municipality/kochi/',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"ゾウドウは全国でここだけ","priority":90},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"佐川で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#激レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['unique_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  496,
  '群馬県/沼田市',
  '群馬県',
  '10',
  '沼田',
  '群馬県沼田市利根町追貝1005-1',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(139.208649 36.699986)'),
  ARRAY['ダーテング', 'ノココッチ'],
  'https://local.pokemon.jp/manhole/desc/496/?is_modal=1',
  '',
  'https://local.pokemon.jp/manhole/desc/496/?is_modal=1',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"ノココッチは全国でここだけ","priority":90},{"emoji":"🌟","hashtag":"#レアポケふた","key":"rare_pokemon","label":"レアポケふた（全国2枚）","priority":70},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"沼田で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#激レアポケふた', '#レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['unique_pokemon', 'rare_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  497,
  '群馬県/館林市',
  '群馬県',
  '10',
  '館林',
  '群馬県館林市花山町3181',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(139.55104 36.241375)'),
  ARRAY['ガラルジグザグマ', 'ジグザグマ'],
  'https://local.pokemon.jp/manhole/desc/497/?is_modal=1',
  '',
  'https://local.pokemon.jp/manhole/desc/497/?is_modal=1',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"ガラルジグザグマは全国でここだけ","priority":90},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"館林で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#激レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['unique_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  498,
  '群馬県/渋川市',
  '群馬県',
  '10',
  '渋川',
  '群馬県渋川市伊香保町伊香保560番地1',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(138.9192351 36.49717728)'),
  ARRAY['サンダー'],
  'https://local.pokemon.jp/manhole/desc/498/?is_modal=1',
  '',
  'https://local.pokemon.jp/manhole/desc/498/?is_modal=1',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"サンダーは全国でここだけ","priority":90},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"渋川で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#激レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['unique_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  499,
  '群馬県/下仁田町',
  '群馬県',
  '10',
  '下仁田',
  '群馬県下仁田町大字下仁田381-2',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(138.787017 36.210725)'),
  ARRAY['カモネギ', 'ガラルカモネギ', 'ネギガナイト'],
  'https://local.pokemon.jp/manhole/desc/499/?is_modal=1',
  '',
  'https://local.pokemon.jp/manhole/desc/499/?is_modal=1',
  '[{"emoji":"🌟","hashtag":"#レアポケふた","key":"rare_pokemon","label":"レアポケふた（全国3枚）","priority":70},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"下仁田で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['rare_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  500,
  '群馬県/長野原町',
  '群馬県',
  '10',
  '長野原',
  '群馬県長野原町林1567-4',
  NULL,
  '',
  ST_GeogFromText('SRID=4326;POINT(138.684549 36.547169)'),
  ARRAY['アズマオウ', 'パルスワン', 'メルタン'],
  'https://local.pokemon.jp/manhole/desc/500/?is_modal=1',
  '',
  'https://local.pokemon.jp/manhole/desc/500/?is_modal=1',
  '[{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"アズマオウは全国でここだけ","priority":90},{"emoji":"⭐","hashtag":"#激レアポケふた","key":"unique_pokemon","label":"パルスワンは全国でここだけ","priority":90},{"emoji":"🏘","hashtag":"#ご当地ポケふた","key":"only_in_city","label":"長野原で唯一のポケふた","priority":60},{"emoji":"🆕","hashtag":"#新作ポケふた","key":"newest","label":"最新設置ロット","priority":50}]'::jsonb,
  ARRAY['#激レアポケふた', '#激レアポケふた', '#ご当地ポケふた', '#新作ポケふた'],
  ARRAY['unique_pokemon', 'unique_pokemon', 'only_in_city', 'newest'],
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.manhole m
SET prefecture_id = p.id
FROM public.prefecture p
WHERE m.id BETWEEN 487 AND 500 AND m.prefecture = p.name AND m.prefecture_id IS NULL;

UPDATE public.manhole
SET region = CASE
    WHEN prefecture_code = '01' THEN '北海道'
    WHEN prefecture_code IN ('02', '03', '04', '05', '06', '07') THEN '東北'
    WHEN prefecture_code IN ('08', '09', '10', '11', '12', '13', '14') THEN '関東'
    WHEN prefecture_code IN ('15', '16', '17', '18', '19', '20', '21', '22', '23') THEN '中部'
    WHEN prefecture_code IN ('24', '25', '26', '27', '28', '29', '30') THEN '関西'
    WHEN prefecture_code IN ('31', '32', '33', '34', '35') THEN '中国'
    WHEN prefecture_code IN ('36', '37', '38', '39') THEN '四国'
    ELSE '九州沖縄'
  END
WHERE id BETWEEN 487 AND 500 AND region IS NULL AND prefecture_code IS NOT NULL;

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.manhole
  WHERE id BETWEEN 487 AND 500 AND prefecture_id IS NOT NULL AND location IS NOT NULL;
  IF v_n <> 14 THEN
    RAISE EXCEPTION 'manhole 487〜500 が % 行（14 行のはず）', v_n;
  END IF;
END
$$;
