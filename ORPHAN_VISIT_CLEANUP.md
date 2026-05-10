# Orphan Visit レコードの検出と修復

## 問題の概要

`visit` テーブルに `app_user` テーブルに存在しない `user_id` を持つレコード（orphan visit）が存在します。

### 根本原因

1. **Signup 時の RLS ポリシー制限**
   - `app_user` テーブルの INSERT RLS ポリシーが制限的
   - Signup 時に `app_user` 作成が失敗する可能性あり
   - ユーザーは `auth.users` には存在するが `app_user` には存在しない状態に

2. **Visit 作成時に app_user チェックがない**
   - `/api/visits` POST は `session?.user` のみチェック
   - `/api/image-upload` POST も同様
   - `app_user` 存在確認がないため orphan visit が作成される

## 検出方法

### クエリ 1: Orphan Visit の数を確認

```sql
-- app_user に存在しない user_id を持つ visit を検出
SELECT COUNT(*) as orphan_visits
FROM public.visit v
WHERE v.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);
```

### クエリ 2: Orphan Visit の詳細を確認

```sql
-- Orphan visit の詳細情報
SELECT 
  v.id as visit_id,
  v.user_id,
  v.manhole_id,
  v.shot_at,
  v.created_at,
  COUNT(p.id) as photo_count,
  COUNT(DISTINCT vl.id) as like_count,
  COUNT(DISTINCT vc.id) as comment_count
FROM public.visit v
LEFT JOIN public.photo p ON v.id = p.visit_id
LEFT JOIN public.visit_like vl ON v.id = vl.visit_id
LEFT JOIN public.visit_comment vc ON v.id = vc.visit_id
WHERE v.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id)
GROUP BY v.id, v.user_id
ORDER BY v.created_at DESC;
```

### クエリ 3: Auth users テーブルからユーザー情報を確認

```sql
-- auth.users に存在するが app_user に存在しないユーザー
SELECT DISTINCT
  au.id as auth_user_id,
  au.email,
  COUNT(v.id) as visit_count
FROM auth.users au
LEFT JOIN public.visit v ON au.id = v.user_id
WHERE NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = au.id)
GROUP BY au.id, au.email
ORDER BY COUNT(v.id) DESC;
```

## 修復方法

### 方法 1: 自動的に app_user を作成（推奨）

```sql
-- Orphan visit のユーザーに対して app_user を作成
INSERT INTO public.app_user (auth_uid, display_name, email, created_at, updated_at)
SELECT DISTINCT
  v.user_id,
  COALESCE(au.email, 'User')::TEXT as display_name,
  au.email,
  NOW(),
  NOW()
FROM public.visit v
LEFT JOIN auth.users au ON v.user_id = au.id
WHERE v.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id)
ON CONFLICT (auth_uid) DO NOTHING;
```

### 方法 2: Orphan Visit を検証する（修復前に必須）

```sql
-- 修復後、orphan visit がなくなったことを確認
SELECT COUNT(*) as remaining_orphan_visits
FROM public.visit v
WHERE v.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);

-- 期待値: 0
```

## 予防策（実装済）

### コード修正

以下のファイルに app_user 存在チェック + 自動作成ロジックを追加しました：

1. **[src/app/api/visits/route.ts](src/app/api/visits/route.ts)**
   - POST ハンドラで visit 作成前に app_user 存在確認
   - 存在しない場合は自動作成

2. **[src/app/api/image-upload/route.ts](src/app/api/image-upload/route.ts)**
   - POST ハンドラで visit 作成前に app_user 存在確認
   - 存在しない場合は自動作成

### 動作フロー

```
ユーザー認証 (session.user.id 取得)
  ↓
[新規] app_user.auth_uid チェック
  ↓
  存在しない？
  ├─ Yes → app_user 自動作成
  │        (エラーでも visit 作成続行、ログ記録)
  └─ No  → 次へ
  ↓
Visit レコード作成 ✅
```

## 実装ログ

```
✅ 修正 1: src/app/api/visits/route.ts POST で app_user チェック + 自動作成
✅ 修正 2: src/app/api/image-upload/route.ts POST で app_user チェック + 自動作成
📋 修正 3: 本ドキュメント作成
```

## 実行手順

1. **データベースで orphan visit を確認**
   ```bash
   # クエリ 1 実行
   psql -c "SELECT COUNT(*) as orphan_visits FROM ..."
   ```

2. **修復 SQL を実行（手動または migration として）**
   ```bash
   # 方法 1 実行
   psql -f migration_fix_orphan_visits.sql
   ```

3. **検証**
   ```bash
   # クエリ 2 実行
   psql -c "SELECT COUNT(*) as remaining_orphan_visits FROM ..."
   ```

4. **コード デプロイ**
   - 修正されたコード（visits/route.ts, image-upload/route.ts）をデプロイ
   - 以降の visit 作成は orphan 化しない

## 参考

- テーブル定義: [src/types/database.ts](src/types/database.ts)
- ユーザーモデル: [src/lib/supabase.ts](src/lib/supabase.ts)
- API エンドポイント: [src/app/api/visits/route.ts](src/app/api/visits/route.ts)
