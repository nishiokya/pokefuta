# データベースマイグレーション

このディレクトリには、Supabaseデータベースのマイグレーションファイルが含まれています。

## マイグレーションの実行方法

### Supabase Dashboard での実行

1. [Supabase Dashboard](https://supabase.com/dashboard) にアクセス
2. プロジェクトを選択
3. 左サイドバーから「SQL Editor」を選択
4. 「New query」をクリック
5. マイグレーションファイルの内容をコピー＆ペースト
6. 「Run」をクリック

### マイグレーションファイル一覧

| ファイル名 | 説明 | 実行日 | ステータス |
|----------|------|--------|-----------|
| `003_visit_public_policy.sql` | visitテーブルに`comment`と`is_public`カラムを追加し、公開ポリシーを設定 | 2025-10-26 | ⏳ 未実行 |

## 最新のマイグレーション: 003_visit_public_policy.sql

### 目的

- `visit`テーブルに`comment`カラムを追加（訪問時の公開コメント）
- `visit`テーブルに`is_public`カラムを追加（公開/非公開フラグ、デフォルト: true）
- RLSポリシーを更新して、`is_public=true`のvisitを全員が閲覧可能にする

### 変更内容

1. **カラム追加**:
   - `comment TEXT` - 訪問時の公開コメント
   - `is_public BOOLEAN DEFAULT true` - 公開/非公開フラグ

2. **RLSポリシー変更**:
   - 旧: `users_select_own_visits` - 自分のvisitのみ閲覧可能
   - 新: `users_select_own_or_public_visits` - 自分のvisitまたは`is_public=true`のvisitを閲覧可能

### 実行方法

```bash
# Supabase SQL Editorで以下を実行
cat database/migrations/003_visit_public_policy.sql
```

または、以下のSQLを直接実行：

```sql
-- commentカラムとis_publicカラムを追加
ALTER TABLE visit ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "users_select_own_visits" ON visit;

-- 新しいポリシーを作成
CREATE POLICY "users_select_own_or_public_visits"
ON visit FOR SELECT
USING (
  auth.uid() = user_id OR is_public = true
);
```

### 確認方法

```sql
-- カラムの確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'visit' AND column_name IN ('comment', 'is_public');

-- RLSポリシーの確認
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'visit';
```

## トラブルシューティング

### エラー: `relation "visit" does not exist`

- `visit`テーブルが存在しません。先に基本的なテーブルを作成してください。

### エラー: `column "comment" already exists`

- すでにカラムが存在します。`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`を使用しているため、通常は発生しません。

### RLSポリシーが機能しない

```sql
-- RLSが有効化されているか確認
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'visit';

-- 期待される結果: rowsecurity = true
```

## 注意事項

⚠️ **本番環境での実行前に必ずバックアップを取得してください**

⚠️ **ステージング環境でテストしてから本番環境に適用してください**
