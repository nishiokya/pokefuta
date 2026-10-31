-- デザインふた投稿で、公式サイトに載っていない新しいポケふたも受ける（公式 local.pokemon.jp が止まっている間の受け口）。
-- 場所は既存どおり写真の GPS（latitude / longitude）。図鑑への反映や正式な番号との対応は、投稿が来てから決める。
--
-- kind: design=ポケふた以外のデザインマンホール（既存の行はすべてこれ）、pokefuta=公式未掲載のポケふた
-- INSERT はテーブル単位で authenticated に GRANT 済みなので列を足すだけで書ける。
-- 公開の SELECT は列単位 GRANT で、kind はまだ公開しない（見せ方を決めてから GRANT する）。

ALTER TABLE public.design_manhole
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'design';

ALTER TABLE public.design_manhole
  DROP CONSTRAINT IF EXISTS design_manhole_kind_check;
ALTER TABLE public.design_manhole
  ADD CONSTRAINT design_manhole_kind_check CHECK (kind IN ('design', 'pokefuta'));

COMMENT ON COLUMN public.design_manhole.kind IS
  'design=ポケふた以外のデザインマンホール、pokefuta=公式サイト未掲載の新しいポケふた（投稿者の申告）';
