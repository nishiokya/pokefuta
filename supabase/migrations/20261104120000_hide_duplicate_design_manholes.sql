-- 同じ写真が重複して公開されているデザインマンホール投稿を非公開にする。
-- どれも写真に公式ポケふたが写っていて、同じ写真がもう1枚公開されているか、
-- ポケふたの投稿として同じ撮影時刻の写真がある。
--   839b972b / a0244c75: ポケふた #410 の投稿と同じ撮影（2枚は同じ写真）
--   7e67be6c: 3fa561c2 と同じ写真（3fa561c2 は残す）
-- 'hidden' は投稿者本人には今までどおり見える（design_manhole_public_select）ので、戻すときは status を 'published' にする。

UPDATE public.design_manhole
SET status = 'hidden'
WHERE id IN (
  '839b972b-c624-4c35-b2de-d3d80357e19a',
  'a0244c75-2110-40c4-8675-3ca880f0a191',
  '7e67be6c-6bd8-4bec-96f2-3542d2eb2a17'
)
  AND status = 'published';
