# 🔍 Database Implementation Checklist 実行 & 検証

## 📋 概要

このISSUEでは、**IMPLEMENTATION_CHECKLIST.md** に記載されている全実装チェックを段階的に実行し、データベーススキーマの整合性を検証します。

**対応する変更:**
- Migration 005: Prefecture Badge System
- Migration 006: Extend Manhole Fields
- manhole_update.sql: 全マンホールデータ更新

---

## 🎯 実行内容

### Phase 1: スキーマ検証 ✅
- [ ] Prefecture テーブル確認（47行）
- [ ] Prefecture Badge テーブル確認
- [ ] Manhole テーブル拡張確認

### Phase 2: データ整合性確認 ✅
- [ ] Prefecture ID のデータ埋込確認
- [ ] Prefecture Code の確認（01-47）
- [ ] Address フィールドのデータ埋込確認
- [ ] Prefecture Site URL の確認
- [ ] Orphaned データの確認

### Phase 3: クエリ検証 ✅
- [ ] 愛知県（prefecture_code = '23'）の統計確認
- [ ] 都道府県別投稿者ランキングクエリの検証

### Phase 4: バッジシステム検証 ✅
- [ ] 都道府県バッジシステム関数の確認
- [ ] トリガーの確認
- [ ] ビューの確認

### Phase 5: パフォーマンステスト ✅
- [ ] インデックス利用状況の確認
- [ ] 複雑クエリの実行時間確認

---

## 📝 実行手順

### 前提条件
- ✅ Migration 005 が実行済み
- ✅ Migration 006 が実行済み
- ✅ manhole_update.sql が実行済み

### Step 1: クエリの実行

**Supabase SQL Editor で実行:**

1. [IMPLEMENTATION_CHECKLIST.md](../../IMPLEMENTATION_CHECKLIST.md) を開く
2. **Phase 1** のクエリを順番に実行
3. 各フェーズの期待値と照合
4. すべてのチェック項目に ✅ をつける

### Step 2: 結果の記録

このISSUEのコメント欄に以下をコピペして結果を記入：

```
### Phase 1: スキーマ検証

**1.1 Prefecture テーブル確認**
- prefecture_count: ___ (期待値: 47)
- code 確認: ✅ / ❌

**1.2 Prefecture Badge テーブル確認**
- テーブル構造: ✅ / ❌
- インデックス: ✅ / ❌

**1.3 Manhole テーブル拡張確認**
- カラム追加: ✅ / ❌
- インデックス: ✅ / ❌

...
```

### Step 3: 問題があればレポート

**問題が見つかった場合:**
- 問題の説明と出力結果を記入
- 該当するクエリを引用
- 推奨される対処方法を提案

---

## ⚠️ よくある問題と対処

### 問題1: orphaned データが存在する

```
orphaned_visits: 5
```

**原因:** visit.user_id が app_user.auth_uid に存在しない

**対処:**
```sql
-- orphaned visit の確認
SELECT v.id, v.user_id
FROM public.visit v
WHERE NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id)
LIMIT 10;

-- 削除する場合
DELETE FROM public.visit v
WHERE NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);
```

---

### 問題2: prefecture_id が NULL のマンホール

```
null_prefecture_id: 15
```

**原因:** マンホールの prefecture 名が prefecture テーブルに存在しない

**対処:**
```sql
-- NULL のマンホール確認
SELECT DISTINCT prefecture
FROM public.manhole
WHERE prefecture_id IS NULL
LIMIT 10;

-- 手動マッピング
UPDATE public.manhole
SET prefecture_id = (SELECT id FROM prefecture WHERE name = '◎◎県')
WHERE prefecture = '◎◎県' AND prefecture_id IS NULL;
```

---

### 問題3: クエリが JOIN エラーになる

```
ERROR: column "p.user_id" does not exist
```

**原因:** 不正な JOIN キーを使用している

**正解:**
```sql
-- ❌ 間違い
INNER JOIN public.app_user u ON v.user_id = u.id

-- ✅ 正解
INNER JOIN public.app_user u ON v.user_id = u.auth_uid
```

---

## 📊 期待値一覧

| チェック項目 | 期待値 |
|------------|--------|
| prefecture_count | 47 |
| null_prefecture_id | 0 |
| orphaned_photos | 0 |
| orphaned_visits | 0 |
| invalid_prefecture_id | 0 |
| invalid_codes | 0 |
| prefecture_code range | '01' ～ '47' |
| address fill_percentage | > 90% |
| prefecture_site_url fill_percentage | > 80% |

---

## 🔗 参考リンク

- [DATABASE_SCHEMA_REFERENCE.md](../../DATABASE_SCHEMA_REFERENCE.md) - スキーマ設計ガイド
- [IMPLEMENTATION_CHECKLIST.md](../../IMPLEMENTATION_CHECKLIST.md) - チェックスクリプト一覧
- [Migration 005](../../database/migrations/005_add_prefecture_badge_system.sql)
- [Migration 006](../../database/migrations/006_extend_manhole_fields.sql)

---

## ✅ 完了基準

すべてのフェーズで以下を満たす必要があります：

- [ ] **Phase 1**: すべてのテーブル/カラム/インデックスが存在
- [ ] **Phase 2**: データ整合性が 100%（orphaned データなし）
- [ ] **Phase 3**: クエリが正常に実行され、結果が返される
- [ ] **Phase 4**: 関数、トリガー、ビューが存在
- [ ] **Phase 5**: インデックスが適切に利用されている

---

## 🚀 PR作成ガイドライン

このISSUEを解決するPRは以下を含めてください：

**PR タイトル例:**
```
feat(db): Run implementation checklist and validate schema integrity
```

**PR 説明:**
```markdown
## 概要
IMPLEMENTATION_CHECKLIST.md に基づく全スキーマ検証を実行しました。

## チェック結果
- Phase 1: ✅ 完了
- Phase 2: ✅ 完了
- Phase 3: ✅ 完了
- Phase 4: ✅ 完了
- Phase 5: ✅ 完了

## 実行クエリ結果
[チェック結果をコピペ]

## 対応する Issue
Closes #XXX
```

---

## 📞 サポート

問題が発生した場合は、以下を記入してコメントしてください：

1. 実行したクエリ
2. エラーメッセージ（完全な内容）
3. 期待していた結果
4. 実際の結果

---

**作成日**: 2026年5月10日  
**優先度**: 🔴 High（本番デプロイ前の必須タスク）  
**担当**: @nishiokya
