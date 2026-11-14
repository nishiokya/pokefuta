-- ポケモン GO のポケストップ画面のスクリーンショット 20 枚を、代表写真の候補外にする（quality_eligible = false）。
--
-- 2026-11-09。投稿写真のうち 279 枚が、ポケモン GO のポケストップ画面のスクショだった（現地で撮った写真ではない）。
-- 見分け方は k11 の manhole-ai Tools/common/go_screenshot.py（PNG・EXIF に機種名なし・Software が Android・縦長）。
-- 259 枚は採点でもともと候補外。残る 20 枚（公開 19・非公開 1）をここで候補外にする。
-- これから投稿されるものは、k11 の自動採点（manhole-score score_incremental.py の mark_go_screenshot）が候補外で書く。
--
-- 候補外の写真は、写真館（src/lib/manhole-photo-ranking.ts の rankManholePhotos）と
-- 図鑑（pokefuta-tracker apps/scraper/export_latest_manhole_photos.py）で、未採点の写真より後ろに並ぶ。
-- ひとこと付きの写真を先に出す決まりはそのまま（ひとこと付きの GO スクショは、ひとことの無い写真より前に出る）。
-- 2026-11-09 の DB で、蓋のページの先頭・丸い切り抜きの代表のどちらにも GO スクショが出ている蓋は 0、
-- 公開写真が GO スクショだけの蓋も 0 で、この変更で見た目の代表は変わらない。
--
-- 変えるのは quality_eligible だけ。点（quality_score）・版・採点時刻・AI タグは変えないので、
-- 自動採点の楽観ロック（quality_score_version, quality_scored_at）にも影響しない。
-- photo_protect_quality_score トリガは anon / authenticated からの変更だけを戻す（マイグレーションは postgres）。
--
-- ロールバック:
--   UPDATE public.photo SET quality_eligible = true WHERE id IN (<下の 20 件>);
DO $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.photo
  SET quality_eligible = false
  WHERE quality_eligible = true
    AND content_type = 'image/png'
    AND id IN (
      '02e4d4d7-3993-45ee-aad4-311c1cb3924f', '0dab4f67-fbf6-4ddf-abe3-c288e8d08e92',
      '1be1e0d4-3195-43d0-aeab-cbb8f2765b5e', '23b5c759-5027-4c0b-8b00-b06ee274a1b6',
      '23e8dad1-129c-41c1-b13b-23865562a493', '29aeb85f-da09-49dc-a28c-3087e75d2e31',
      '2ddfdb5f-9dfd-4359-99a7-e1685279932b', '2e9313a0-d776-4b85-82ac-7b130f895574',
      '3a26d05a-9be8-4cef-b649-9b5e328362d5', '4ba6fb8d-4759-4d4a-91b9-b04f78855891',
      '6a4ff27c-7c77-4023-a86d-3810704cc361', '8267a9f8-684b-4905-9209-a9ed2c8599ee',
      '8c526bfe-e01f-4fe4-b6a2-6b3bf0545b9a', '99313c60-0363-4e78-9ff2-e0b176bf5083',
      'b68e8203-60b4-48ff-af28-462bff0621d6', 'c40df714-8bba-4055-8835-bb739feb96a7',
      'c4b2677b-a89f-482c-bb05-bc33df17aa09', 'e74888ae-f77b-424d-8f77-059279d30aa3',
      'ebb6415b-2afe-47e3-8b32-4ae03a752550', 'f6f029fa-d863-4cd1-b9b9-0098f961f11c'
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- 20 件より多くは書かない（IN の件数で上限が決まる）。少ないのは、適用までに採点し直された・消えた写真がある場合
  RAISE NOTICE 'GO スクショ % 枚を代表写真の候補外にした', v_n;
END $$;
