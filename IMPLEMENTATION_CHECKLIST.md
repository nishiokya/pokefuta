# ポケふた 実装チェックスクリプト

**実行方法**: Supabase SQL Editor でこれらのクエリを順番に実行してください

---

## ✅ Phase 1: データベーススキーマ検証

### 1.1 Prefecture テーブル確認

```sql
-- 期待値: 47行
SELECT COUNT(*) as prefecture_count FROM public.prefecture;

-- 都道府県コード確認
SELECT code, name FROM public.prefecture ORDER BY code LIMIT 10;
```

**チェック項目:**
- [ ] prefecture_count = 47
- [ ] code は '01' から '47' まで存在

---

### 1.2 Prefecture Badge テーブル確認

```sql
-- テーブル構造確認
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'prefecture_badge'
ORDER BY ordinal_position;

-- インデックス確認
SELECT indexname FROM pg_indexes WHERE tablename = 'prefecture_badge';
```

**チェック項目:**
- [ ] id, user_id, prefecture_id, status, acquired_at, outdated_at などのカラムが存在
- [ ] idx_unique_active_badge_per_user_prefecture インデックスが存在

---

### 1.3 Manhole テーブル拡張確認

```sql
-- 新規カラムが存在するか確認
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'manhole'
  AND column_name IN ('prefecture_id', 'prefecture_code', 'address', 'prefecture_site_url')
ORDER BY column_name;

-- インデックス確認
SELECT indexname FROM pg_indexes 
WHERE tablename = 'manhole' 
  AND indexname LIKE '%prefecture%'
ORDER BY indexname;
```

**チェック項目:**
- [ ] prefecture_id (INTEGER)
- [ ] prefecture_code (character varying)
- [ ] address (text)
- [ ] prefecture_site_url (text)
- [ ] idx_manhole_prefecture_id, idx_manhole_prefecture_code インデックスが存在

---

## ✅ Phase 2: データ整合性確認

### 2.1 Prefecture ID のデータ埋込確認

```sql
-- NULL でない prefecture_id の件数
SELECT 
  COUNT(*) as total_manhole,
  COUNT(prefecture_id) as filled_prefecture_id,
  ROUND(100.0 * COUNT(prefecture_id) / COUNT(*), 2) as fill_percentage
FROM public.manhole;

-- NULL が残っているか確認
SELECT COUNT(*) as null_prefecture_id
FROM public.manhole
WHERE prefecture_id IS NULL;
```

**チェック項目:**
- [ ] fill_percentage = 100%
- [ ] null_prefecture_id = 0

---

### 2.2 Prefecture Code の確認

```sql
-- 都道府県コード の分布
SELECT 
  prefecture_code,
  COUNT(*) as manhole_count
FROM public.manhole
WHERE prefecture_code IS NOT NULL
GROUP BY prefecture_code
ORDER BY prefecture_code;

-- 無効なコード（01-47 以外）の確認
SELECT COUNT(*) as invalid_codes
FROM public.manhole
WHERE prefecture_code IS NOT NULL 
  AND (LENGTH(prefecture_code) != 2 
    OR prefecture_code < '01' 
    OR prefecture_code > '47');
```

**チェック項目:**
- [ ] すべての prefecture_code が '01' ～ '47' の範囲
- [ ] invalid_codes = 0

---

### 2.3 Address フィールドのデータ埋込確認

```sql
-- Address の入力状況
SELECT 
  COUNT(*) as total_manhole,
  COUNT(address) as filled_address,
  ROUND(100.0 * COUNT(address) / COUNT(*), 2) as fill_percentage,
  COUNT(CASE WHEN LENGTH(address) < 5 THEN 1 END) as suspiciously_short
FROM public.manhole;

-- Address の例（最初の10件）
SELECT id, prefecture, title, address 
FROM public.manhole 
WHERE address IS NOT NULL
LIMIT 10;
```

**チェック項目:**
- [ ] fill_percentage が高い（90%以上推奨）
- [ ] suspiciously_short が少ない（不正なデータ検出）

---

### 2.4 Prefecture Site URL の確認

```sql
-- Prefecture Site URL の入力状況
SELECT 
  COUNT(*) as total_manhole,
  COUNT(prefecture_site_url) as filled_url,
  ROUND(100.0 * COUNT(prefecture_site_url) / COUNT(*), 2) as fill_percentage
FROM public.manhole;

-- URL の例（最初の5件）
SELECT id, title, prefecture_site_url 
FROM public.manhole 
WHERE prefecture_site_url IS NOT NULL
LIMIT 5;
```

**チェック項目:**
- [ ] fill_percentage が高い（80%以上推奨）

---

### 2.5 Orphaned データの確認

```sql
-- visit に紐づかない photo
SELECT COUNT(*) as orphaned_photos
FROM public.photo p
WHERE p.visit_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.visit v WHERE v.id = p.visit_id);

-- app_user に紐づかない visit
SELECT COUNT(*) as orphaned_visits
FROM public.visit v
WHERE v.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);

-- manhole に紐づかない prefecture_id
SELECT COUNT(*) as invalid_prefecture_id
FROM public.manhole m
WHERE m.prefecture_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.prefecture p WHERE p.id = m.prefecture_id);
```

**チェック項目:**
- [ ] orphaned_photos = 0
- [ ] orphaned_visits = 0
- [ ] invalid_prefecture_id = 0

---

## ✅ Phase 3: 都道府県別投稿者クエリの検証

### 3.1 愛知県（prefecture_code = '23'）のテスト

```sql
-- 愛知県の基本統計
SELECT 
  'manhole' as table_name, COUNT(*) as record_count
FROM public.manhole 
WHERE prefecture_code = '23'
UNION ALL
SELECT 
  'visit', COUNT(DISTINCT v.id)
FROM public.visit v
INNER JOIN public.photo p ON v.id = p.visit_id
INNER JOIN public.manhole m ON p.manhole_id = m.id
WHERE m.prefecture_code = '23'
UNION ALL
SELECT 
  'photo', COUNT(*)
FROM public.photo p
INNER JOIN public.manhole m ON p.manhole_id = m.id
WHERE m.prefecture_code = '23'
UNION ALL
SELECT 
  'user', COUNT(DISTINCT u.id)
FROM public.app_user u
INNER JOIN public.visit v ON u.auth_uid = v.user_id
INNER JOIN public.photo p ON v.id = p.visit_id
INNER JOIN public.manhole m ON p.manhole_id = m.id
WHERE m.prefecture_code = '23';
```

**チェック項目:**
- [ ] manhole record_count > 0
- [ ] visit record_count > 0
- [ ] photo record_count > 0
- [ ] user record_count > 0（または app_user テーブルが空の場合は N/A）

---

### 3.2 都道府県別投稿者ランキング

```sql
-- 愛知県投稿者ランキング
SELECT
  u.id,
  u.display_name,
  u.auth_uid,
  COUNT(DISTINCT m.id) AS unique_manhole_count,
  COUNT(p.id) AS total_photo_count,
  MAX(p.created_at) AS last_upload_date
FROM public.visit v
INNER JOIN public.photo p ON v.id = p.visit_id
INNER JOIN public.manhole m ON p.manhole_id = m.id
INNER JOIN public.app_user u ON v.user_id = u.auth_uid
WHERE m.prefecture_code = '23'
GROUP BY u.id, u.display_name, u.auth_uid
ORDER BY total_photo_count DESC
LIMIT 10;
```

**チェック項目:**
- [ ] クエリが実行できる（エラーなし）
- [ ] user.id, display_name が正しく表示される
- [ ] total_photo_count > 0

---

## ✅ Phase 4: 都道府県バッジシステムの検証

### 4.1 バッジシステム関数の確認

```sql
-- 関数が存在するか確認
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%prefecture%'
ORDER BY routine_name;
```

**チェック項目:**
- [ ] create_prefecture_badge 関数が存在
- [ ] check_and_update_all_prefectures_completion 関数が存在
- [ ] update_prefecture_badges_on_manhole_add 関数が存在

---

### 4.2 トリガーの確認

```sql
-- トリガーが存在するか確認
SELECT 
  trigger_name,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'manhole';
```

**チェック項目:**
- [ ] trigger_update_badges_on_manhole_add が存在

---

### 4.3 ビューの確認

```sql
-- ビューが存在するか確認
SELECT 
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'VIEW'
ORDER BY table_name;
```

**チェック項目:**
- [ ] prefecture_completion_tracker ビューが存在

---

## ✅ Phase 5: パフォーマンステスト

### 5.1 インデックス利用状況

```sql
-- manhole テーブルのインデックス
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'manhole'
ORDER BY indexname;

-- prefecture_badge テーブルのインデックス
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'prefecture_badge'
ORDER BY indexname;
```

**チェック項目:**
- [ ] すべての重要なカラムにインデックスが存在

---

### 5.2 複雑クエリの実行時間

```sql
-- クエリプランと実行時間を確認
EXPLAIN ANALYZE
SELECT
  u.id,
  u.display_name,
  COUNT(DISTINCT m.id) AS unique_manhole_count
FROM public.visit v
INNER JOIN public.photo p ON v.id = p.visit_id
INNER JOIN public.manhole m ON p.manhole_id = m.id
INNER JOIN public.app_user u ON v.user_id = u.auth_uid
GROUP BY u.id, u.display_name;
```

**チェック項目:**
- [ ] Seq Scan（フルテーブルスキャン）がないか確認
- [ ] Index Scan/Bitmap Index Scan が使われているか確認

---

## 📊 チェックリスト最終版

実行順序：

```
Phase 1: スキーマ検証 ✅
  [ ] 1.1 Prefecture テーブル
  [ ] 1.2 Prefecture Badge テーブル
  [ ] 1.3 Manhole 拡張

Phase 2: データ整合性 ✅
  [ ] 2.1 Prefecture ID 埋込
  [ ] 2.2 Prefecture Code
  [ ] 2.3 Address
  [ ] 2.4 Prefecture Site URL
  [ ] 2.5 Orphaned データ

Phase 3: クエリ検証 ✅
  [ ] 3.1 愛知県統計
  [ ] 3.2 投稿者ランキング

Phase 4: バッジシステム ✅
  [ ] 4.1 関数確認
  [ ] 4.2 トリガー確認
  [ ] 4.3 ビュー確認

Phase 5: パフォーマンス ✅
  [ ] 5.1 インデックス
  [ ] 5.2 クエリプラン
```

すべてのチェックが完了したら、本番環境へのデプロイを開始してください。

---

**作成日**: 2026年5月10日  
**最終確認日**: ___________
