-- 公式の緯度経度が実際の設置場所とずれているポケふた2枚の manhole.location を直す（2026-11-23）
--
-- 投稿の撮影位置（visit.shot_location）の中央が、公式の座標から約50m離れた1か所にまとまっている。
--   64  士別市 道の駅羊のまち 侍・しべつ: 公式のピンは道路側、蓋は建物の側（北東へ約47m）
--   114 日南市 材木町1-10: 東へ約48m
-- 新しい座標は撮影位置の中央。図鑑（pokefuta-tracker）は dataset/pokefuta_coord_overrides.json で同じ座標に
-- 上書きしている（tracker PR #901）。tools/generate_manhole_sql.py は図鑑の公開 ndjson を読むので、
-- 流し直しても同じ座標になる。
--
-- 効くところ:
--   - 投稿時のサーバ側の距離チェック（/api/image-upload の 50m／近くの候補から選んだときの 300m）
--   - 図鑑の docs/api/manholes.json（毎朝 export_app_snapshot.py がここから作る）を読む画面
--     （投稿画面の蓋の候補、近くの蓋、地図、詳細）。スナップショットは翌朝の日次ジョブで追いつく
--   - デザインマンホール投稿の「50m 以内にポケふたがあるか」の確認
--
-- 今の座標が公式のままのときだけ書き換える（誰かが先に直していたら何もしない）。
--
-- ロールバック:
--   UPDATE public.manhole SET location = extensions.ST_GeogFromText('SRID=4326;POINT(142.392417 44.175974)') WHERE id = 64;
--   UPDATE public.manhole SET location = extensions.ST_GeogFromText('SRID=4326;POINT(131.4017058 31.58793)') WHERE id = 114;

UPDATE public.manhole AS m
SET location = extensions.ST_GeogFromText(v.new_point)
FROM (VALUES
  (64,  'SRID=4326;POINT(142.392808 44.176286)', 44.175974::float8, 142.392417::float8),
  (114, 'SRID=4326;POINT(131.402212 31.587939)', 31.58793::float8,  131.4017058::float8)
) AS v(id, new_point, old_lat, old_lng)
WHERE m.id = v.id
  AND abs(extensions.ST_Y(m.location::extensions.geometry) - v.old_lat) < 1e-6
  AND abs(extensions.ST_X(m.location::extensions.geometry) - v.old_lng) < 1e-6;
