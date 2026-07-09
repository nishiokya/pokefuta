-- ============================================================
-- 018: デザインマンホール（ポケふた以外のご当地デザインマンホール）投稿テーブル
-- ============================================================
-- 投稿にはログイン必須（API Route がセッションを検証）。閲覧は誰でも可。
-- 全アクセスは API Route (service role) 経由。anon/authenticated キーからは触れない。
-- モデレーション: Supabase Dashboard の Table Editor で status を 'hidden' に変更する
-- （一覧 API と写真配信 API の両方から消える）。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.design_manhole (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title TEXT,                              -- 任意（例: 「○○市 花柄マンホール」）
  description TEXT,
  submitter_name TEXT,                     -- 任意の表示名（デフォルトはログインユーザーの表示名）

  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL UNIQUE,        -- photos/design/original/YYYY/MM/{uuid}.{ext}
  content_type TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  exif JSONB,                              -- exifr の GPS/整合性フィールド（詐称検知用・非公開）

  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),

  created_by UUID NOT NULL,                -- auth.users.id（visit.user_id と同じ流儀）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_manhole_status_created
  ON public.design_manhole (status, created_at DESC);

-- ユーザー単位のモデレーション・調査用
CREATE INDEX IF NOT EXISTS idx_design_manhole_created_by
  ON public.design_manhole (created_by, created_at DESC);

-- updated_at 自動更新（015 で定義済みの関数を再利用）
DROP TRIGGER IF EXISTS set_design_manhole_updated_at ON public.design_manhole;
CREATE TRIGGER set_design_manhole_updated_at
  BEFORE UPDATE ON public.design_manhole
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: 有効化のみ・ポリシーなし = anon/authenticated キーからは一切アクセス不可。
-- service role (API Route の supabaseAdmin) は RLS をバイパスする。
ALTER TABLE public.design_manhole ENABLE ROW LEVEL SECURITY;
