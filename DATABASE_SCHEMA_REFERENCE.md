# ポケふたデータベース スキーマリファレンス

**作成日**: 2026年5月10日  
**目的**: スキーマ設計の混乱しやすい点とJOIN関係を整理

---

## ⚠️ 重要な注意事項

### 1. **visit.user_id は auth_uid**

```
❌ 間違い：
  JOIN public.app_user u ON v.user_id = u.id

✅ 正解：
  JOIN public.app_user u ON v.user_id = u.auth_uid
```

**理由:**
- `visit.user_id` = Firebase Authentication の UID
- `app_user.id` = Supabase 内の UUID（ユーザーテーブルPK）
- `app_user.auth_uid` = Firebase Auth UID（`visit.user_id`と一致）

---

## 📊 テーブルリレーション

### テーブル構造

```
app_user (ユーザー)
├── id: UUID (Primary Key)
├── auth_uid: VARCHAR (Firebase Auth UID) ⭐ ここで visit と結合
├── display_name: VARCHAR
└── ...

visit (訪問記録)
├── id: UUID (Primary Key)
├── user_id: VARCHAR (Firebase Auth UID) ⭐ app_user.auth_uid と一致
├── manhole_id: BIGINT (FK → manhole.id)
└── ...

photo (写真)
├── id: UUID (Primary Key)
├── visit_id: UUID (FK → visit.id)
├── manhole_id: BIGINT (FK → manhole.id)
└── ...

manhole (マンホール)
├── id: BIGINT (Primary Key)
├── prefecture: VARCHAR
├── prefecture_code: VARCHAR(2) (01-47)
├── prefecture_id: INTEGER (FK → prefecture.id)
└── ...

prefecture (都道府県マスタ)
├── id: SERIAL (Primary Key)
├── code: VARCHAR(2) (01-47)
├── name: VARCHAR (都道府県名)
└── ...
```

---

## 🔗 よく使う JOIN パターン

### パターン1: 都道府県別ユーザー投稿統計

```sql
-- ✅ 正しい JOIN
SELECT
  u.display_name,
  p.prefecture_code,
  COUNT(p.id) as photo_count
FROM public.visit v
INNER JOIN public.app_user u ON v.user_id = u.auth_uid  -- ⭐ auth_uid を使う
INNER JOIN public.photo ph ON v.id = ph.visit_id
INNER JOIN public.manhole m ON ph.manhole_id = m.id
WHERE m.prefecture_code = '23'
GROUP BY u.display_name, p.prefecture_code;
```

### パターン2: マンホール毎の訪問者

```sql
SELECT
  m.id,
  m.title,
  u.display_name,
  COUNT(v.id) as visit_count
FROM public.manhole m
LEFT JOIN public.visit v ON m.id = v.manhole_id
LEFT JOIN public.app_user u ON v.user_id = u.auth_uid  -- ⭐ auth_uid を使う
WHERE m.prefecture_code = '23'
GROUP BY m.id, m.title, u.display_name;
```

### パターン3: ユーザー訪問統計

```sql
SELECT
  u.id,
  u.display_name,
  COUNT(DISTINCT m.id) as unique_manhole_count,
  COUNT(v.id) as visit_count
FROM public.app_user u
LEFT JOIN public.visit v ON u.auth_uid = v.user_id  -- ⭐ auth_uid = user_id
LEFT JOIN public.manhole m ON v.manhole_id = m.id
GROUP BY u.id, u.display_name
ORDER BY visit_count DESC;
```

---

## 🔍 データ整合性チェック

### チェック1: orphaned photo（存在しない visit に紐づく photo）

```sql
SELECT COUNT(*) as orphaned_photos
FROM public.photo p
WHERE p.visit_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.visit v WHERE v.id = p.visit_id);
```

**期待値**: 0

### チェック2: orphaned visit（存在しない user に紐づく visit）

```sql
SELECT COUNT(*) as orphaned_visits
FROM public.visit v
WHERE v.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);
```

**期待値**: 0

### チェック3: manhole の prefecture_id が NULL のケース

```sql
SELECT COUNT(*) as null_prefecture_id
FROM public.manhole
WHERE prefecture_id IS NULL;
```

**期待値**: 0（Migration 006 実行後）

### チェック4: prefecture_code 値の確認

```sql
SELECT DISTINCT prefecture_code
FROM public.manhole
WHERE prefecture_code IS NOT NULL
ORDER BY prefecture_code;
```

**期待値**: 01〜47 の連続した番号

---

## 📝 API/フロントエンド実装時の注意

### ❌ よくある間違い

```typescript
// 間違い: visit.user_id を app_user.id で検索
const user = await supabase
  .from('app_user')
  .select('*')
  .eq('id', visit.user_id)  // ❌ これは失敗する
  .single();
```

### ✅ 正しい実装

```typescript
// 正しい: visit.user_id を app_user.auth_uid で検索
const user = await supabase
  .from('app_user')
  .select('*')
  .eq('auth_uid', visit.user_id)  // ✅ 成功
  .single();

// または auth.user から直接取得
const { data: { user } } = await supabase.auth.getUser();
// user.id === app_user.auth_uid
```

---

## 🛠️ マイグレーション実行順序

```
1️⃣  Migration 005: Prefecture Badge System
    - prefecture テーブル作成
    - prefecture_badge テーブル作成
    - 47都道府県初期データ INSERT

2️⃣  Migration 006: Extend Manhole Fields
    - manhole に prefecture_id, prefecture_code, region, address 等追加
    - 既存データに prefecture_id, prefecture_code, region を埋込

3️⃣  Data Population: manhole_update.sql
    - 全マンホールデータを最新化
    - prefecture_site_url を含める
```

---

## 📋 実装チェックリスト

### データベース層
- [ ] Migration 005 実行確認（prefecture テーブル 47行）
- [ ] Migration 006 実行確認（manhole テーブルカラム追加）
- [ ] manhole_update.sql 実行（全マンホールデータ更新）
- [ ] `prefecture_id` が NULL でないことを確認
- [ ] `prefecture_code` が 01-47 であることを確認
- [ ] Orphaned データ（孤立レコード）がないことを確認

### API層
- [ ] GET `/api/badges/prefectures` - 都道府県バッジ取得
- [ ] POST `/api/badges/prefectures` - バッジ確認・作成
- [ ] GET `/api/badges/global` - グローバルバッジ取得
- [ ] visit → app_user の JOIN キーが `auth_uid` であること確認

### フロントエンド層
- [ ] `usePrefectureBadges()` Hook の動作確認
- [ ] `useGlobalBadge()` Hook の動作確認
- [ ] `PrefectureBadgeDisplay` コンポーネント表示確認
- [ ] バッジ古い化時の状態遷移確認

### 統合テスト
- [ ] テストユーザーで都道府県完成テスト
- [ ] 新規マンホール追加時にバッジが古い化するか確認
- [ ] 全47都道府県制覇時にグローバルバッジが表示されるか確認
- [ ] 愛知県投稿者クエリで正しいユーザーが表示されるか確認

---

## 🚀 クエリ集

### よく使うクエリ

**都道府県別投稿者ランキング:**
```sql
SELECT
  u.display_name,
  pr.name as prefecture,
  COUNT(DISTINCT m.id) AS unique_manhole_count,
  COUNT(ph.id) AS total_photo_count
FROM public.visit v
INNER JOIN public.app_user u ON v.user_id = u.auth_uid
INNER JOIN public.photo ph ON v.id = ph.visit_id
INNER JOIN public.manhole m ON ph.manhole_id = m.id
INNER JOIN public.prefecture pr ON m.prefecture_id = pr.id
GROUP BY u.display_name, pr.name
ORDER BY total_photo_count DESC;
```

**ユーザー毎の完成都道府県:**
```sql
SELECT
  u.display_name,
  COUNT(pb.id) as completed_prefectures
FROM public.app_user u
LEFT JOIN public.prefecture_badge pb ON u.id = pb.user_id AND pb.status = 'active'
GROUP BY u.id, u.display_name
ORDER BY completed_prefectures DESC;
```

**地方別完成状況:**
```sql
SELECT
  m.region,
  COUNT(DISTINCT m.id) as total_manhole,
  COUNT(DISTINCT CASE WHEN v.id IS NOT NULL THEN m.id END) as visited_manhole
FROM public.manhole m
LEFT JOIN public.visit v ON m.id = v.manhole_id AND v.user_id = $1
WHERE m.is_active = true
GROUP BY m.region
ORDER BY m.region;
```

---

**最終更新**: 2026年5月10日  
**バージョン**: 1.0
