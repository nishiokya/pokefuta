-- ---------------------------------------------------------------------------
-- 蓋のタグ（称号）の間違い指摘
--
-- タグ（manhole.titles。「ビーチのポケふた」「観光地のポケふた」など）は
-- 図鑑（data.pokefuta.com）側で自動生成して取り込んだもので、写真館では直せない。
-- 利用者の「このタグは違う」を集めて、図鑑側で直すための受け皿。
--
-- 公開のコメント欄に混ぜないのは、指摘が会話ではなく運営への連絡だから。
-- 形は comment_report（20260811150000）に揃えた:
--   - 読めるのは service_role だけ（SELECT ポリシーを作らない）。
--     「誰が何を指摘したか」を公開面に出す理由が無い
--   - GRANT は列名指し。テーブル単位にすると、列を足した瞬間に自動で開く
--   - 同じ人が同じ蓋の同じタグを何度指摘しても1件
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.manhole_title_report (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manhole_id        bigint NOT NULL REFERENCES public.manhole(id) ON DELETE CASCADE,
  -- manhole.titles[].key。タグは取り込みで入れ替わりうるので外部キーにはできない。
  -- 指摘した時点の表示名も残して、後から key が消えても何の話か読めるようにする。
  title_key         text NOT NULL,
  title_label       text,
  reporter_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason            text,
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at       timestamp with time zone,
  CONSTRAINT manhole_title_report_key_length CHECK (char_length(title_key) BETWEEN 1 AND 100),
  CONSTRAINT manhole_title_report_label_length CHECK (title_label IS NULL OR char_length(title_label) <= 100),
  CONSTRAINT manhole_title_report_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS manhole_title_report_unique_reporter
  ON public.manhole_title_report (manhole_id, title_key, reporter_user_id)
  WHERE reporter_user_id IS NOT NULL;

-- 未処理の指摘を拾う並び。運用で見るのはこれ。
CREATE INDEX IF NOT EXISTS manhole_title_report_unresolved
  ON public.manhole_title_report (created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.manhole_title_report ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.manhole_title_report FROM PUBLIC, anon, authenticated;
GRANT INSERT (manhole_id, title_key, title_label, reporter_user_id, reason)
  ON public.manhole_title_report TO authenticated;

-- 自分の名前でしか指摘できない。
DROP POLICY IF EXISTS users_insert_own_title_reports ON public.manhole_title_report;
CREATE POLICY users_insert_own_title_reports ON public.manhole_title_report
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_user_id);

-- **アプリ側は INSERT に `.select()` を付けないこと。** SELECT ポリシーが無いので
-- `INSERT ... RETURNING` は 42501 で落ちる（comment_report と同じ）。
COMMENT ON TABLE public.manhole_title_report IS
  '蓋のタグ（manhole.titles）の間違い指摘。読めるのは service_role のみ。'
  ' 未処理（resolved_at IS NULL）を見て図鑑側のタグを直し、resolved_at を埋める運用。';
