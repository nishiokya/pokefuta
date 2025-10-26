-- ==========================================
-- ポケふた - ソーシャル機能テーブル
-- ==========================================
-- 作成日: 2025-10-20
-- 目的: いいね、コメント、ブックマーク機能の追加

-- ==========================================
-- 1. visit_like テーブル
-- ==========================================
-- 訪問記録へのいいね
CREATE TABLE IF NOT EXISTS visit_like (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- 1ユーザーが1つの訪問記録に1つのいいねのみ
  UNIQUE(visit_id, user_id)
);

-- RLS有効化
ALTER TABLE visit_like ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
-- 全員がいいねを閲覧可能（公開データ）
DROP POLICY IF EXISTS "public_select_visit_likes" ON visit_like;
CREATE POLICY "public_select_visit_likes"
ON visit_like FOR SELECT
USING (true);

-- 自分のいいねのみ作成可能
DROP POLICY IF EXISTS "users_insert_own_likes" ON visit_like;
CREATE POLICY "users_insert_own_likes"
ON visit_like FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 自分のいいねのみ削除可能
DROP POLICY IF EXISTS "users_delete_own_likes" ON visit_like;
CREATE POLICY "users_delete_own_likes"
ON visit_like FOR DELETE
USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_visit_like_visit_id ON visit_like(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_like_user_id ON visit_like(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_like_created_at ON visit_like(created_at DESC);

-- ==========================================
-- 2. visit_comment テーブル
-- ==========================================
-- 訪問記録へのコメント（他のユーザーからのコメント）
CREATE TABLE IF NOT EXISTS visit_comment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- コメント長制限
  CONSTRAINT visit_comment_content_length CHECK (char_length(content) <= 1000)
);

-- RLS有効化
ALTER TABLE visit_comment ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
-- 全員がコメントを閲覧可能（公開データ）
DROP POLICY IF EXISTS "public_select_visit_comments" ON visit_comment;
CREATE POLICY "public_select_visit_comments"
ON visit_comment FOR SELECT
USING (true);

-- ログインユーザーのみコメント作成可能
DROP POLICY IF EXISTS "users_insert_comments" ON visit_comment;
CREATE POLICY "users_insert_comments"
ON visit_comment FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 自分のコメントのみ更新可能
DROP POLICY IF EXISTS "users_update_own_comments" ON visit_comment;
CREATE POLICY "users_update_own_comments"
ON visit_comment FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 自分のコメントのみ削除可能
DROP POLICY IF EXISTS "users_delete_own_comments" ON visit_comment;
CREATE POLICY "users_delete_own_comments"
ON visit_comment FOR DELETE
USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_visit_comment_visit_id ON visit_comment(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_comment_user_id ON visit_comment(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_comment_created_at ON visit_comment(created_at DESC);

-- 更新日時の自動更新トリガー
DROP TRIGGER IF EXISTS update_visit_comment_updated_at ON visit_comment;
CREATE TRIGGER update_visit_comment_updated_at
    BEFORE UPDATE ON visit_comment
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 3. visit_bookmark テーブル
-- ==========================================
-- 訪問記録のブックマーク
CREATE TABLE IF NOT EXISTS visit_bookmark (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- 1ユーザーが1つの訪問記録に1つのブックマークのみ
  UNIQUE(visit_id, user_id)
);

-- RLS有効化
ALTER TABLE visit_bookmark ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
-- 自分のブックマークのみ閲覧可能（プライベートデータ）
DROP POLICY IF EXISTS "users_select_own_bookmarks" ON visit_bookmark;
CREATE POLICY "users_select_own_bookmarks"
ON visit_bookmark FOR SELECT
USING (auth.uid() = user_id);

-- 自分のブックマークのみ作成可能
DROP POLICY IF EXISTS "users_insert_own_bookmarks" ON visit_bookmark;
CREATE POLICY "users_insert_own_bookmarks"
ON visit_bookmark FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 自分のブックマークのみ削除可能
DROP POLICY IF EXISTS "users_delete_own_bookmarks" ON visit_bookmark;
CREATE POLICY "users_delete_own_bookmarks"
ON visit_bookmark FOR DELETE
USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_visit_bookmark_visit_id ON visit_bookmark(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_bookmark_user_id ON visit_bookmark(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_bookmark_created_at ON visit_bookmark(created_at DESC);

-- ==========================================
-- 確認クエリ
-- ==========================================
-- 以下を実行して設定を確認してください：

-- RLSポリシー確認
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('visit_like', 'visit_comment', 'visit_bookmark')
ORDER BY tablename, policyname;

-- インデックス確認
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('visit_like', 'visit_comment', 'visit_bookmark')
ORDER BY tablename, indexname;
