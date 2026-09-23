-- ---------------------------------------------------------------------------
-- タグの指摘に「足りないタグの提案」を足す（20260923150000 の続き）
--
-- 既存タグの間違い（kind = 'wrong'）に加えて、その蓋に無いタグの提案
-- （kind = 'suggest'）も同じ受け皿で受ける。どちらも運営が読んで図鑑側で反映する
-- 連絡なので、テーブルを分けると読む場所が2つになるだけ。
--
-- 権限の形は変えない: 本人の名前でだけ INSERT、SELECT は service_role のみ、
-- GRANT は列名指し（足した列も名指しで足す）。
-- ---------------------------------------------------------------------------

ALTER TABLE public.manhole_title_report
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'wrong',
  ADD COLUMN IF NOT EXISTS suggested_label text;

-- 提案には既存タグが無いので title_key を任意にする。代わりに kind ごとの必須項目を CHECK で縛る。
ALTER TABLE public.manhole_title_report ALTER COLUMN title_key DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.manhole_title_report
    ADD CONSTRAINT manhole_title_report_kind CHECK (kind IN ('wrong', 'suggest'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.manhole_title_report
    ADD CONSTRAINT manhole_title_report_kind_fields CHECK (
      (kind = 'wrong' AND title_key IS NOT NULL AND suggested_label IS NULL)
      OR (kind = 'suggest' AND suggested_label IS NOT NULL AND title_key IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.manhole_title_report
    ADD CONSTRAINT manhole_title_report_suggested_label_length
    CHECK (suggested_label IS NULL OR char_length(btrim(suggested_label)) BETWEEN 1 AND 50);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 同じ人が同じ蓋に同じ名前を何度提案しても1件（大文字小文字・前後の空白は同一視）。
-- 既存の manhole_title_report_unique_reporter は title_key が NULL の行を縛らないので別に張る。
CREATE UNIQUE INDEX IF NOT EXISTS manhole_title_report_unique_suggestion
  ON public.manhole_title_report (manhole_id, lower(btrim(suggested_label)), reporter_user_id)
  WHERE kind = 'suggest' AND reporter_user_id IS NOT NULL;

GRANT INSERT (kind, suggested_label) ON public.manhole_title_report TO authenticated;

COMMENT ON TABLE public.manhole_title_report IS
  '蓋のタグ（manhole.titles）の間違い指摘（kind=wrong）と足りないタグの提案（kind=suggest）。'
  ' 読めるのは service_role のみ。未処理（resolved_at IS NULL）を見て図鑑側を直し、resolved_at を埋める運用。';
