-- 近接レビュー強制のトリガは BEFORE INSERT のみなので、20260808000000 より前に
-- 投稿された行は一度も近接判定を受けていない。列は追加されたが全行 NULL のままで、
-- 「近くに公式ポケふたは無い」と読めてしまう。事実を埋める。
--
-- status は触らない。50m 以内であることは誤投稿の疑いを示すだけで証拠ではなく、
-- 実際 2026-08-10 時点の該当4件は投稿者本人（tako）が別の蓋だと確認している。

WITH submitted AS (
  SELECT
    id,
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(longitude, latitude),
      4326
    )::extensions.geography AS location
  FROM public.design_manhole
),
nearest AS (
  SELECT
    s.id AS design_id,
    n.manhole_id,
    ROUND(n.distance)::INTEGER AS distance_m
  FROM submitted AS s
  CROSS JOIN LATERAL (
    SELECT
      m.id AS manhole_id,
      extensions.ST_Distance(m.location, s.location) AS distance
    FROM public.manhole AS m
    WHERE m.is_active
      AND extensions.ST_DWithin(m.location, s.location, 50)
    ORDER BY extensions.ST_Distance(m.location, s.location), m.id
    LIMIT 1
  ) AS n
)
UPDATE public.design_manhole AS d
SET
  nearby_official_manhole_id = nearest.manhole_id,
  nearby_official_manhole_distance_m = nearest.distance_m
FROM nearest
WHERE d.id = nearest.design_id;

-- 50m 以内で公開中の4件について、投稿者が「公式ポケふたではなく別の蓋」だと
-- 確認した事実を残す（2026-08-10）。ID を直に書くのは、これが計算結果ではなく
-- 人間の判断だから。述語で書くと、後から条件に合致した別の行まで
-- 「確認済み」にしてしまう。
--
--   5c3afc6d… ガンダムマンホール  公式#66  7m   北海道 天塩
--   91d3f8c7… 当別                公式#278 18m  北海道 当別
--   e313d143… 浜松駅前            公式#348 18m  静岡県 浜松
--   57ad6967… 豊橋駅前            公式#272 46m  愛知県 豊橋市
UPDATE public.design_manhole
SET nearby_official_manhole_confirmed_at = NOW()
WHERE id IN (
  '5c3afc6d-3b35-400a-8cb7-c903b7a1eabe',
  '91d3f8c7-4cac-43b6-8547-d26a02c4ae91',
  'e313d143-c00d-4481-9967-7aee6242ecf9',
  '57ad6967-4950-4d99-8700-0d3de45f4ab6'
)
  AND nearby_official_manhole_id IS NOT NULL
  AND nearby_official_manhole_confirmed_at IS NULL;
