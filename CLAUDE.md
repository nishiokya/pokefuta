# Pokefuta Security Implementation Guide

このドキュメントは、pokefutaアプリケーションのセキュリティ実装ガイドです。Claude Codeでの実装時に参照してください。

## 🎯 セキュリティの優先事項

### 重要度: CRITICAL
1. **Supabase RLS (Row Level Security)** - すべてのテーブルで有効化必須
2. **環境変数の保護** - Service Role Keyの漏洩防止
3. **認証チェック** - すべてのAPI Routeで実装

### 重要度: HIGH
4. **Rate Limiting** - API濫用防止
5. **ファイルアップロードの検証** - 画像サイズ・タイプチェック
6. **CSPヘッダー** - XSS攻撃防止

---

## 📖 API ドキュメント管理

### Swagger/OpenAPI による API 仕様管理

**⚠️ 重要: 新しいAPIを作成したら、必ずSwaggerアノテーションを追加してください！**

#### ルール

1. **すべてのAPI Routeファイルに`@swagger`コメントを追加**
   - 新規API作成時は必須
   - 既存APIの変更時も更新

2. **Swaggerアノテーションの書き方**

```typescript
/**
 * @swagger
 * /api/your-endpoint:
 *   get:
 *     summary: エンドポイントの概要
 *     tags: [タグ名]
 *     description: 詳細な説明
 *     security:
 *       - cookieAuth: []  # 認証が必要な場合
 *     parameters:
 *       - in: query
 *         name: パラメータ名
 *         schema:
 *           type: string
 *         description: パラメータの説明
 *     responses:
 *       200:
 *         description: 成功時のレスポンス
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: 認証エラー
 */
export async function GET(request: NextRequest) {
  // ...
}
```

3. **利用可能なタグ**
   - `manholes`: マンホール情報API
   - `visits`: 訪問記録API
   - `photos`: 写真管理API
   - `auth`: 認証API

4. **共通スキーマ**
   - `Manhole`: マンホール情報
   - `Visit`: 訪問記録
   - `Photo`: 写真データ
   - `Error`: エラーレスポンス

5. **セキュリティスキーム**
   ```yaml
   security:
     - cookieAuth: []  # Supabase認証Cookie
   ```

#### Swagger UI の確認

- **Swagger UI**: http://localhost:3000/api-docs （開発環境のみ）
- **OpenAPI JSON**: http://localhost:3000/api/swagger （開発環境のみ）

**⚠️ セキュリティ**: 本番環境では自動的に無効化され、403エラーを返します。

#### 例: 新規APIの追加

```typescript
// src/app/api/your-new-api/route.ts

/**
 * @swagger
 * /api/your-new-api:
 *   post:
 *     summary: 新機能のAPI
 *     tags: [your-tag]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功
 *       401:
 *         description: 認証が必要
 */
export async function POST(request: NextRequest) {
  // ✅ 1. 認証チェック
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  // ✅ 2. 実装
  // ...

  return NextResponse.json({ success: true });
}
```

#### チェックリスト

新規API作成時は以下を確認：
- [ ] `@swagger`コメントを追加
- [ ] 適切なタグを設定
- [ ] 認証が必要な場合は`security`を追加
- [ ] パラメータとレスポンスを正確に記述
- [ ] Swagger UIで表示を確認（http://localhost:3000/api-docs）

---

## 📁 プロジェクト構造

```
pokefuta/
├── app/
│   ├── api/              # API Routes (認証必須)
│   │   ├── visits/       # 訪問記録API
│   │   ├── photos/       # 写真アップロードAPI
│   │   └── upload/       # R2署名付きURL生成
│   └── ...
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Supabaseクライアント
│   │   └── middleware.ts # 認証ミドルウェア
│   └── storage/
│       └── r2.ts         # R2クライアント
└── database/
    └── migrations/
        └── 001_enable_rls.sql  # RLS設定
```

---

## 🔒 1. Supabase RLS 設定

### ⚠️ 重要な前提条件

**本プロジェクトの設計：visit.user_id → auth.users(id) を直接参照**

採用理由：
- ✅ シンプルなRLSポリシー: `auth.uid() = user_id`
- ✅ 高速なクエリ: app_user経由のJOINが不要
- ✅ APIコードが簡潔: `session.user.id`を直接使用
- ✅ メンテナンス性: visitとapp_userの依存関係が緩い

app_userテーブルの役割：
- ユーザープロフィール情報のみ管理（display_name, avatar_url等）
- visitデータとは独立して扱う

### データベーススキーマ

#### 完全なテーブル定義

```sql
-- ==========================================
-- app_user テーブル
-- ==========================================
-- ユーザープロフィール情報
-- auth.usersとapp_userを分離することで、認証情報と
-- アプリケーション固有のデータを管理
CREATE TABLE IF NOT EXISTS app_user (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_uid UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_app_user_updated_at
    BEFORE UPDATE ON app_user
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- manhole テーブル
-- ==========================================
-- ポケふたマスタデータ (公開)
-- 全ユーザー共通の公開データ
CREATE TABLE IF NOT EXISTS manhole (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  prefecture TEXT NOT NULL,
  municipality TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS型
  pokemons TEXT[],
  detail_url TEXT,
  prefecture_site_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- visit テーブル
-- ==========================================
-- 訪問記録 (ユーザー個別)
-- ⚠️ 重要: user_idはauth.users(id)を直接参照（推奨）
CREATE TABLE IF NOT EXISTS visit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manhole_id INTEGER REFERENCES manhole(id),
  shot_location GEOGRAPHY(POINT, 4326),  -- PostGIS型
  shot_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- photo テーブル
-- ==========================================
-- 写真データ (ユーザー個別)
-- R2ストレージのキーを保存
CREATE TABLE IF NOT EXISTS photo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES visit(id) ON DELETE CASCADE,
  manhole_id INTEGER REFERENCES manhole(id),
  storage_key TEXT NOT NULL,
  original_name TEXT,
  file_size INTEGER,
  content_type TEXT,
  width INTEGER,
  height INTEGER,
  exif JSONB,
  sha256 TEXT,
  thumbnail_320 TEXT,
  thumbnail_800 TEXT,
  thumbnail_1600 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 📋 データベースセットアップSQL（完全版）

**以下のSQLをSupabase SQL Editorで実行してください：**

```sql
-- ==========================================
-- ポケふた - 完全なデータベーススキーマ
-- ==========================================

-- ==========================================
-- 1. app_user テーブル
-- ==========================================
CREATE TABLE IF NOT EXISTS app_user (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_uid UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_app_user_updated_at ON app_user;
CREATE TRIGGER update_app_user_updated_at
    BEFORE UPDATE ON app_user
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS有効化
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
DROP POLICY IF EXISTS "users_select_own" ON app_user;
CREATE POLICY "users_select_own"
ON app_user FOR SELECT
USING (auth.uid() = auth_uid);

DROP POLICY IF EXISTS "users_update_own" ON app_user;
CREATE POLICY "users_update_own"
ON app_user FOR UPDATE
USING (auth.uid() = auth_uid)
WITH CHECK (auth.uid() = auth_uid);

DROP POLICY IF EXISTS "users_insert_own" ON app_user;
CREATE POLICY "users_insert_own"
ON app_user FOR INSERT
WITH CHECK (auth.uid() = auth_uid);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_app_user_auth_uid ON app_user(auth_uid);

-- ==========================================
-- 2. visit テーブル
-- ==========================================
-- 注意: manholeテーブルは既存のためCREATEしない
-- visit.user_id は auth.users.id を直接参照（推奨）

CREATE TABLE IF NOT EXISTS visit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manhole_id INTEGER REFERENCES manhole(id),
  shot_location GEOGRAPHY(POINT, 4326),
  shot_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効化
ALTER TABLE visit ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（シンプル版）
DROP POLICY IF EXISTS "users_select_own_visits" ON visit;
CREATE POLICY "users_select_own_visits"
ON visit FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_visits" ON visit;
CREATE POLICY "users_insert_own_visits"
ON visit FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_visits" ON visit;
CREATE POLICY "users_update_own_visits"
ON visit FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_visits" ON visit;
CREATE POLICY "users_delete_own_visits"
ON visit FOR DELETE
USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_visit_user_id ON visit(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_manhole_id ON visit(manhole_id);
CREATE INDEX IF NOT EXISTS idx_visit_shot_at ON visit(shot_at DESC);

-- ==========================================
-- 3. photo テーブル
-- ==========================================
CREATE TABLE IF NOT EXISTS photo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES visit(id) ON DELETE CASCADE,
  manhole_id INTEGER REFERENCES manhole(id),
  storage_key TEXT NOT NULL,
  original_name TEXT,
  file_size INTEGER,
  content_type TEXT,
  width INTEGER,
  height INTEGER,
  exif JSONB,
  sha256 TEXT,
  thumbnail_320 TEXT,
  thumbnail_800 TEXT,
  thumbnail_1600 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効化
ALTER TABLE photo ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（全員が閲覧可能、作成・更新・削除はvisit所有者のみ）
DROP POLICY IF EXISTS "public_select_photos" ON photo;
CREATE POLICY "public_select_photos"
ON photo FOR SELECT
USING (true);

DROP POLICY IF EXISTS "users_insert_own_photos" ON photo;
CREATE POLICY "users_insert_own_photos"
ON photo FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "users_update_own_photos" ON photo;
CREATE POLICY "users_update_own_photos"
ON photo FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "users_delete_own_photos" ON photo;
CREATE POLICY "users_delete_own_photos"
ON photo FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
);

-- ⚠️ 注意: 既存の制限的なSELECTポリシーを削除
DROP POLICY IF EXISTS "users_select_own_photos" ON photo;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_photo_visit_id ON photo(visit_id);
CREATE INDEX IF NOT EXISTS idx_photo_storage_key ON photo(storage_key);
CREATE INDEX IF NOT EXISTS idx_photo_manhole_id ON photo(manhole_id);

-- ==========================================
-- 📸 photoテーブルのスキーマ変更（2025-10-12）
-- ==========================================
-- 変更内容:
-- 1. manhole_id を NOT NULL に変更（写真は必ずマンホールに紐づける）
-- 2. visit_id はオプショナルのまま（visitなしでもマンホール情報から表示可能）
--
-- 目的:
-- - 写真をマンホールなしでアップロードできないようにする
-- - visitがなくてもマンホールの詳細を表示できるようにする

-- ⚠️ 既存データのクリーンアップ（manhole_idがNULLのphotoを削除）
-- 本番環境では、manhole_idがNULLの写真を適切に処理してから実行してください
DELETE FROM photo WHERE manhole_id IS NULL;

-- manhole_idをNOT NULLに変更
ALTER TABLE photo ALTER COLUMN manhole_id SET NOT NULL;

-- ==========================================
-- RLSポリシーに関する注意事項
-- ==========================================
-- 現在のRLSポリシー:
-- - SELECT: public_select_photos (全員が閲覧可能)
-- - INSERT/UPDATE/DELETE: visit経由でチェック
--
-- 現在の実装では、photoは常にvisitと一緒に作成されるため、
-- visit_idは常に存在します。そのため、既存のRLSポリシーで問題ありません。
--
-- ⚠️ 将来の考慮事項:
-- もし将来、visit_idがNULLのphotoを作成する機能を追加する場合は、
-- INSERT/UPDATE/DELETEポリシーを以下のように更新する必要があります:
--
-- CREATE POLICY "users_insert_own_photos_v2"
-- ON photo FOR INSERT
-- WITH CHECK (
--   -- visitがある場合はvisit経由でチェック
--   (visit_id IS NOT NULL AND EXISTS (
--     SELECT 1 FROM visit
--     WHERE visit.id = photo.visit_id
--     AND visit.user_id = auth.uid()
--   ))
--   OR
--   -- visitがない場合はmanhole_idの存在のみチェック
--   (visit_id IS NULL AND manhole_id IS NOT NULL)
-- );
--
-- 現時点では変更不要です。

-- インデックスの追加（既に存在する場合はスキップ）
CREATE INDEX IF NOT EXISTS idx_photo_manhole_id ON photo(manhole_id);

-- 確認クエリ
-- 以下を実行して、manhole_idがNOT NULLになっているか確認:
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'photo' AND column_name IN ('visit_id', 'manhole_id');

-- 期待される結果:
-- visit_id    | YES      | uuid
-- manhole_id  | NO       | integer

-- ==========================================
-- 4. manhole テーブルのRLS設定
-- ==========================================
-- 既存テーブルのため、RLS設定のみ追加

ALTER TABLE manhole ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_manholes" ON manhole;
CREATE POLICY "public_select_manholes"
ON manhole FOR SELECT
USING (true);

-- ==========================================
-- 確認クエリ
-- ==========================================
-- 以下を実行して設定を確認してください：

-- RLSポリシー確認
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('app_user', 'visit', 'photo', 'manhole')
ORDER BY tablename, policyname;

-- 外部キー制約確認
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('app_user', 'visit', 'photo')
ORDER BY tc.table_name;
```

### RLS ポリシー設定

#### app_user テーブル

```sql
-- RLS有効化
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;

-- 自分のプロフィールは読み取り可能
CREATE POLICY "users_select_own"
ON app_user FOR SELECT
USING (auth.uid() = auth_uid);

-- 自分のプロフィールのみ更新可能
CREATE POLICY "users_update_own"
ON app_user FOR UPDATE
USING (auth.uid() = auth_uid)
WITH CHECK (auth.uid() = auth_uid);

-- 新規ユーザー登録時のみINSERT可能
CREATE POLICY "users_insert_own"
ON app_user FOR INSERT
WITH CHECK (auth.uid() = auth_uid);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_app_user_auth_uid ON app_user(auth_uid);
```

#### visit テーブル

```sql
-- RLS有効化
ALTER TABLE visit ENABLE ROW LEVEL SECURITY;

-- シンプル版RLSポリシー（visit.user_id → auth.users.id）

-- 自分の訪問記録のみ閲覧可能
CREATE POLICY "users_select_own_visits"
ON visit FOR SELECT
USING (auth.uid() = user_id);

-- 自分のIDでのみ訪問記録を作成可能
CREATE POLICY "users_insert_own_visits"
ON visit FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 自分の訪問記録のみ更新可能
CREATE POLICY "users_update_own_visits"
ON visit FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 自分の訪問記録のみ削除可能
CREATE POLICY "users_delete_own_visits"
ON visit FOR DELETE
USING (auth.uid() = user_id);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_visit_user_id ON visit(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_manhole_id ON visit(manhole_id);
CREATE INDEX IF NOT EXISTS idx_visit_shot_at ON visit(shot_at DESC);
```

#### photo テーブル

```sql
-- RLS有効化
ALTER TABLE photo ENABLE ROW LEVEL SECURITY;

-- 📸 写真は全員が閲覧可能（公開データ）
-- これにより、ログインしていないユーザーも写真を見ることができます

-- 全員が写真を閲覧可能（公開データ）
CREATE POLICY "public_select_photos"
ON photo FOR SELECT
USING (true);

-- 自分の訪問記録に紐づく写真のみ作成可能
CREATE POLICY "users_insert_own_photos"
ON photo FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
);

-- 自分の写真のみ更新可能
CREATE POLICY "users_update_own_photos"
ON photo FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
);

-- 自分の写真のみ削除可能
CREATE POLICY "users_delete_own_photos"
ON photo FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM visit
    WHERE visit.id = photo.visit_id
    AND visit.user_id = auth.uid()
  )
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_photo_visit_id ON photo(visit_id);
CREATE INDEX IF NOT EXISTS idx_photo_storage_key ON photo(storage_key);
```

#### manhole テーブル

```sql
-- RLS有効化
ALTER TABLE manhole ENABLE ROW LEVEL SECURITY;

-- 全員がマンホール情報を閲覧可能（公開データ）
CREATE POLICY "public_select_manholes"
ON manhole FOR SELECT
USING (true);

-- 管理者のみがマンホール情報を作成・更新・削除可能
-- （必要に応じて後で設定）
```

### 重要なポイント

1. **visit.user_id は auth.users.id を直接参照（推奨）**
   - RLSポリシー: `auth.uid() = user_id`（シンプル）
   - APIコード: `session.user.id`を直接使用
   - パフォーマンス: app_user経由のJOINが不要

2. **app_user テーブルの役割**
   - ユーザープロフィール情報（display_name, avatar_url）
   - アプリ固有の設定やメタデータ
   - visitとは独立して管理

3. **photo テーブルは公開データ**
   - 全員が写真を閲覧可能（`USING (true)`）
   - 作成・更新・削除はvisit所有者のみ可能
   - これにより、ログインしていないユーザーも写真を見ることができます

4. **manhole は公開データ**
   - 全員が閲覧可能（`USING (true)`）
   - 更新は管理者のみ（後で実装）

5. **データフロー**
   ```
   auth.users.id (Supabaseの認証ID)
        ↓ 直接参照
   visit.user_id (訪問記録の所有者)
        ↓ visit経由
   photo (写真データ)

   auth.users.id → auth_uid → app_user (プロフィール情報)
   ```

---

## 🔑 2. 環境変数の管理

### `.env.local` (開発環境)

```bash
# ==========================================
# Supabase Configuration
# ==========================================
# ✅ フロントエンドで使用OK (RLSで保護される)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ⚠️ 絶対にフロントエンドで使用しない！API Routeでのみ使用
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ==========================================
# Cloudflare R2 Configuration
# ==========================================
# ⚠️ サーバーサイドのみ
R2_ACCESS_KEY_ID=xxxxx
R2_SECRET_ACCESS_KEY=xxxxx
R2_ENDPOINT=https://509ce5c2ad8789cb0c6b20908ab44404.r2.cloudflarestorage.com
R2_BUCKET=pokefuta-photos

# ✅ 公開URL (フロントエンドで使用OK)
NEXT_PUBLIC_R2_PUBLIC_URL=https://img.yourdomain.com

# ==========================================
# App Configuration
# ==========================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# ==========================================
# Optional: Rate Limiting (Upstash Redis)
# ==========================================
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxx
```

### `.env.example` (リポジトリにコミット)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Cloudflare R2
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_ENDPOINT=your_r2_endpoint
R2_BUCKET=your_bucket_name
NEXT_PUBLIC_R2_PUBLIC_URL=your_public_url

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `.gitignore` (必須設定)

```
# 環境変数 (絶対にコミットしない！)
.env*.local
.env.production
.env

# Vercel/Amplify
.vercel
.amplify
```

---

## 🛡️ 3. Supabaseクライアントの実装

### `lib/supabase/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

// ==========================================
// フロントエンド用クライアント
// ==========================================
// RLSで保護されるため、ANON_KEYの使用は安全
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)

// ==========================================
// サーバーサイド用クライアント (Admin)
// ==========================================
// ⚠️ RLSをバイパスするため、API Routeでのみ使用
// ⚠️ 絶対にフロントエンドに露出させない
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
```

### `lib/supabase/middleware.ts`

```typescript
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // セッション更新
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // 認証が必要なページへのアクセス
  if (!session && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

### `lib/supabase/server.ts` (App Router用)

```typescript
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/types/supabase'

export const createServerClient = () => {
  return createServerComponentClient<Database>({ cookies })
}
```

---

## 🔐 4. API Routeのセキュリティ実装

### 基本パターン: `app/api/visits/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

// ==========================================
// GET /api/visits - 訪問記録一覧取得
// ==========================================
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    // ✅ 認証されていない場合は空の配列を返す
    if (!session?.user) {
      return NextResponse.json({
        success: true,
        visits: [],
        stats: {
          total_visits: 0,
          total_photos: 0,
          prefectures: [],
          date_range: { first: null, last: null }
        }
      });
    }

    // ✅ RLSにより自動的に自分のデータのみ取得
    const { data: visits, error } = await supabase
      .from('visit')
      .select(`
        *,
        manhole:manhole_id (
          id,
          title,
          prefecture,
          municipality,
          location,
          pokemons
        ),
        photos:photo (
          id,
          storage_key,
          file_size,
          width,
          height,
          created_at
        )
      `)
      .order('shot_at', { ascending: false })
      .eq('user_id', session.user.id);  // ✅ 必ず自分のデータのみ取得

    if (error) {
      console.error('Error fetching visits:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch visits',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      visits: visits || []
    });

  } catch (error: any) {
    console.error('Unexpected error fetching visits:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// ==========================================
// POST /api/visits - 訪問記録作成
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // ✅ 1. 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const body = await request.json();
    const {
      manhole_id,
      shot_location,
      shot_at,
      note
    } = body;

    // ✅ 2. 入力検証
    if (!shot_at) {
      return NextResponse.json({
        success: false,
        error: 'shot_at is required'
      }, { status: 400 });
    }

    // ✅ 3. user_idを強制的に設定（不正防止）
    const { data: visit, error } = await supabase
      .from('visit')
      .insert({
        user_id: session.user.id,  // ✅ 必ず自分のID
        manhole_id: manhole_id || null,
        shot_location: shot_location || null,
        shot_at,
        note: note || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating visit:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to create visit',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      visit
    });

  } catch (error: any) {
    console.error('Unexpected error creating visit:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
```

### 画像アップロード: `app/api/image-upload/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage, generateStorageKey } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // ✅ 1. 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // ✅ 2. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const manholeId = formData.get('manhole_id');
    const shotAt = formData.get('shot_at');
    const note = formData.get('note');
    const shotLocation = formData.get('shot_location');
    const latitude = formData.get('latitude');
    const longitude = formData.get('longitude');

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 });
    }

    // ✅ 3. ファイル検証
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({
        success: false,
        error: 'File must be an image'
      }, { status: 400 });
    }

    // ✅ 4. R2にアップロード
    const arrayBuffer = await file.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;
    const storageKey = generateStorageKey('original');

    await storage.put(storageKey, arrayBuffer, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    console.log(`File uploaded successfully to storage: ${storageKey}`);

    // ✅ 5. visit記録を作成
    const userId = session.user.id;  // ✅ auth.users.idを直接使用

    let shotAtDate: Date;
    if (shotAt) {
      shotAtDate = new Date(shotAt as string);
      if (isNaN(shotAtDate.getTime())) {
        shotAtDate = new Date();
      }
    } else {
      shotAtDate = new Date();
    }

    // Build shot_location as PostGIS POINT
    let shotLocationGeom = shotLocation as string | null;
    if (latitude && longitude) {
      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);
      if (!isNaN(lat) && !isNaN(lng)) {
        shotLocationGeom = `POINT(${lng} ${lat})`;
      }
    }

    const visitInsert: any = {
      user_id: userId,  // ✅ 必ず自分のID
      shot_at: shotAtDate,
    };

    if (manholeId) {
      visitInsert.manhole_id = parseInt(manholeId as string);
    }
    if (shotLocationGeom) {
      visitInsert.shot_location = shotLocationGeom;
    }
    if (note) {
      visitInsert.note = note as string;
    }

    const { data: visitData, error: visitError } = await supabase
      .from('visit')
      .insert(visitInsert)
      .select()
      .single();

    if (visitError || !visitData) {
      throw new Error(`Visit creation failed: ${visitError?.message}`);
    }

    // ✅ 6. photo記録を作成
    const photoInsert: any = {
      visit_id: visitData.id,
      storage_key: storageKey,
    };

    if (fileSize) photoInsert.file_size = fileSize;
    if (file.type) photoInsert.content_type = file.type;
    if (file.name) photoInsert.original_name = file.name;

    const { data: photoData, error: photoError } = await supabase
      .from('photo')
      .insert(photoInsert)
      .select()
      .single();

    if (photoError || !photoData) {
      throw new Error(`Photo creation failed: ${photoError?.message}`);
    }

    // Get signed URL for response
    const signedUrl = await storage.getSignedUrl(storageKey, 3600);

    return NextResponse.json({
      success: true,
      message: 'Image uploaded successfully',
      visit_id: visitData.id,
      image: {
        id: photoData.id,
        filename: file.name,
        content_type: file.type,
        file_size: fileSize,
        storage_key: storageKey,
        uploaded_at: new Date().toISOString(),
        url: signedUrl.url,
        expires_at: signedUrl.expiresAt,
      },
      storage_provider: process.env.STORAGE_PROVIDER || 'r2',
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during upload',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
```

### ストレージアダプター: `lib/storage/index.ts`

```typescript
import { R2StorageAdapter } from './r2-adapter';

// Cloudflare R2を使用
export const storage = new R2StorageAdapter({
  accountId: process.env.R2_ACCOUNT_ID!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucket: process.env.R2_BUCKET!,
  endpoint: process.env.R2_ENDPOINT!,
  publicUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
});

export function generateStorageKey(type: 'original' | 'thumbnail'): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();

  return `photos/${type}/${year}/${month}/${uuid}.jpg`;
}
```

### 重要なセキュリティポイント

1. **user_idの強制設定**
   ```typescript
   // ❌ 悪い例: リクエストのbodyをそのまま信用
   const { user_id, manhole_id } = body;
   await supabase.from('visit').insert({ user_id, manhole_id });

   // ✅ 良い例: session.user.idを強制的に設定
   await supabase.from('visit').insert({
     user_id: session.user.id,  // 必ず自分のID（auth.users.id）
     manhole_id: body.manhole_id
   });
   ```

2. **RLSポリシーとの二重チェック**
   - APIで`user_id = session.user.id`をフィルタ
   - RLSでも`auth.uid() = user_id`をチェック
   - 二重の防御でセキュリティを確保

3. **エラーハンドリング**
   - 詳細なログは`console.error()`でサーバーログに出力
   - ユーザーには一般的なエラーメッセージのみ返す
   - データベースの構造を漏らさない

---

## 🚦 5. Rate Limiting (推奨)

### `lib/rate-limit.ts`

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Upstash Redisが設定されている場合のみ有効化
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? Redis.fromEnv()
  : null

export const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 h'), // 1時間に10リクエスト
      analytics: true,
    })
  : null

// ==========================================
// Rate Limitチェック関数
// ==========================================
export async function checkRateLimit(identifier: string): Promise<boolean> {
  if (!ratelimit) {
    // Rate Limitが無効の場合は常に許可
    return true
  }

  const { success } = await ratelimit.limit(identifier)
  return success
}
```

### API Routeでの使用例

```typescript
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // ✅ Rate Limitチェック
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const allowed = await checkRateLimit(ip)

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  // ... 通常の処理
}
```

---

## 🛡️ 6. セキュリティヘッダー設定

### `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://*.r2.cloudflarestorage.com",
              "media-src 'self' blob:",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

---

## ✅ セキュリティチェックリスト

実装前に必ず確認してください：

### データベース
- [ ] すべてのテーブルでRLSが有効化されている
- [ ] 各テーブルに適切なRLSポリシーが設定されている
- [ ] インデックスが作成されている

### 環境変数
- [ ] `.env.local`が`.gitignore`に含まれている
- [ ] `SUPABASE_SERVICE_ROLE_KEY`がサーバーサイドでのみ使用されている
- [ ] `R2_ACCESS_KEY`がフロントエンドに露出していない

### API Routes
- [ ] すべてのAPI Routeで認証チェックが実装されている
- [ ] `user_id`が強制的にログインユーザーのIDに設定されている
- [ ] エラーハンドリングが適切に実装されている

### ファイルアップロード
- [ ] ファイルサイズ制限が実装されている (10MB以下)
- [ ] ファイルタイプ検証が実装されている (JPEG/PNG/WebPのみ)
- [ ] 署名付きURLの有効期限が設定されている (5分)

### セキュリティヘッダー
- [ ] CSPヘッダーが設定されている
- [ ] X-Frame-Optionsが設定されている
- [ ] HSTSが設定されている

### Rate Limiting
- [ ] アップロードAPIにRate Limitが実装されている
- [ ] 認証APIにRate Limitが実装されている

---

## 🚀 AWS Amplify Hosting デプロイ前の確認

### 1. 環境変数の設定

Amplify Consoleで以下の環境変数を設定:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
R2_ACCESS_KEY_ID=xxxxx
R2_SECRET_ACCESS_KEY=xxxxx
R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
R2_BUCKET=pokefuta-photos
NEXT_PUBLIC_R2_PUBLIC_URL=https://img.yourdomain.com
NEXT_PUBLIC_APP_URL=https://your-app.amplifyapp.com
```

### 2. ビルド設定

`amplify.yml`を作成:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

### 3. デプロイ後のテスト

- [ ] ログインが正常に動作する
- [ ] 訪問記録の作成・閲覧・削除が正常に動作する
- [ ] 画像アップロードが正常に動作する
- [ ] 他のユーザーのデータが見えないことを確認
- [ ] 共有リンクが正常に動作する

---

## 🔍 トラブルシューティング

### RLSエラー: "new row violates row-level security policy"

**原因**: RLSポリシーが正しく設定されていない

**解決策**:
```sql
-- app_userテーブルの確認
SELECT * FROM app_user WHERE auth_uid = auth.uid();

-- RLSポリシーの確認
SELECT * FROM pg_policies WHERE tablename = 'visit';
```

### 画像アップロードエラー: "403 Forbidden"

**原因**: R2の認証情報が間違っている、またはCORSが設定されていない

**解決策**:
1. Cloudflare DashboardでR2バケットのCORS設定を確認
2. 環境変数が正しく設定されているか確認

```json
// R2 CORS設定
[
  {
    "AllowedOrigins": ["https://your-app.amplifyapp.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 📚 参考リンク

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/security)
- [AWS Amplify Hosting Guide](https://docs.amplify.aws/guides/hosting/nextjs/q/platform/js/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)

---

## 🎯 まとめ

このガイドラインに従うことで、pokefutaアプリケーションは以下のセキュリティを確保できます：

1. ✅ **データの完全な分離** - RLSにより他ユーザーのデータへのアクセスを防止
2. ✅ **認証の徹底** - すべてのAPI Routeで認証チェック
3. ✅ **環境変数の保護** - 機密情報の漏洩防止
4. ✅ **ファイルアップロードの安全性** - サイズ・タイプ検証
5. ✅ **Rate Limiting** - API濫用防止
6. ✅ **セキュリティヘッダー** - XSS/Clickjacking防止

**重要**: RLS設定は最優先で実装してください！
---

## 🚀 AWS Amplify Hosting

### デプロイ概要

pokefutaアプリはAWS Amplify Hostingにデプロイされます。

- **リポジトリ**: https://github.com/nishiokya/pokefuta
- **デプロイブランチ**: `main`
- **ビルド設定**: `amplify.yml`
- **詳細手順**: `DEPLOYMENT.md` を参照

### アーキテクチャ

```
GitHub (main) → AWS Amplify → CloudFront → ユーザー
                      ↓
                 Supabase (DB + Auth)
                      ↓
                 Cloudflare R2 (画像)
```

### 必須環境変数

#### 公開可能（NEXT_PUBLIC_*）
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase プロジェクトURL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Key（RLSで保護される）
- `NEXT_PUBLIC_APP_URL`: アプリURL
- `NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT`: 地図デフォルト緯度
- `NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG`: 地図デフォルト経度

#### サーバーサイドのみ（⚠️絶対に公開しない）
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Key
- `R2_ACCESS_KEY_ID`: Cloudflare R2 Access Key
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 Secret Key
- `R2_ENDPOINT`: R2エンドポイント
- `R2_BUCKET`: R2バケット名
# 注: 画像はsigned URLで配信されるため、公開URLは不要

### セキュリティ設定

#### 1. RLS（Row Level Security）

**必須**: すべてのテーブルでRLSを有効化

```sql
-- visitテーブルのRLS
ALTER TABLE visit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_visits"
ON visit FOR SELECT
USING (auth.uid() = user_id);
```

#### 2. セキュリティヘッダー

`next.config.js`で以下のヘッダーを設定済み：
- `Strict-Transport-Security`: HTTPS強制
- `X-Frame-Options`: Clickjacking防止
- `X-Content-Type-Options`: MIME sniffing防止
- `X-XSS-Protection`: XSS攻撃防止
- `Referrer-Policy`: リファラー制御
- `Permissions-Policy`: 機能ポリシー

#### 3. CORS設定

Cloudflare R2のCORS設定:

```json
[
  {
    "AllowedOrigins": ["https://your-app.amplifyapp.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### ビルド設定（amplify.yml）

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci --cache .npm --prefer-offline
    build:
      commands:
        - env | grep -e NEXT_PUBLIC_ -e SUPABASE_ -e R2_ >> .env.production
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - .next/cache/**/*
      - .npm/**/*
      - node_modules/**/*
```

### デプロイフロー

1. **コードのpush**
   ```bash
   git add .
   git commit -m "Update"
   git push origin main
   ```

2. **自動ビルド開始**
   - Amplifyが自動検知
   - ビルドログはAmplify Consoleで確認

3. **デプロイ**
   - ビルド成功後、自動デプロイ
   - 通常5-10分で完了

4. **確認**
   - デプロイURLにアクセス
   - 全機能をテスト

### トラブルシューティング

#### ビルドエラー

```bash
# ローカルでビルドテスト
npm run build

# TypeScriptエラー確認
npx tsc --noEmit
```

#### 環境変数エラー

- Amplify Console > App Settings > Environment variables を確認
- スペルミスがないか確認
- 再デプロイを実行

#### RLS エラー

```sql
-- RLSポリシー確認
SELECT * FROM pg_policies WHERE tablename = 'visit';

-- RLS有効化確認
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('visit', 'photo', 'app_user');
```

### モニタリング

#### ログ確認

- Amplify Console > Monitoring
- CloudWatch Logs で詳細ログ確認

#### パフォーマンス

- Amplify Console > Analytics
- Core Web Vitals確認

### コスト

#### 無料枠
- ビルド時間: 月1000分
- データ転送: 月15GB
- ホスティング: 無制限

#### 有料プラン
- ビルド時間超過: $0.01/分
- データ転送超過: $0.15/GB

### デプロイ後チェックリスト

- [ ] トップページが正常表示
- [ ] ログイン/サインアップが動作
- [ ] マップ表示
- [ ] 近くのマンホール検索
- [ ] 画像アップロード
- [ ] 訪問履歴表示
- [ ] RLS動作確認（他ユーザーデータ非表示）
- [ ] セキュリティヘッダー確認
- [ ] HTTPS強制確認

### 参考リンク

- [AWS Amplify Next.js Guide](https://docs.amplify.aws/guides/hosting/nextjs/)
- [デプロイ詳細手順](./DEPLOYMENT.md)
- [Amplify CLI](https://docs.amplify.aws/cli/)

---

