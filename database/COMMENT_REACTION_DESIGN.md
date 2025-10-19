# コメント・リアクション機能 設計書

## 📋 概要

ポケふたアプリに以下の機能を追加します：

1. **訪問時のコメント機能**（即時実装）
2. **マンホール詳細へのコメント機能**（将来実装）
3. **リアクション機能（いいね、ブックマーク等）**（将来実装）

---

## 🗄️ データベース設計

### 1. visit テーブルの拡張

#### 追加カラム

| カラム名 | 型 | NULL許可 | デフォルト | 説明 |
|---------|-----|---------|-----------|------|
| `comment` | TEXT | YES | NULL | 訪問時の公開コメント |
| `is_public` | BOOLEAN | NO | false | 訪問記録の公開/非公開フラグ（将来のSNS機能用） |

#### カラムの使い分け

- **`note`**: 個人メモ（非公開、自分だけが見える）
  - 例: "ここは駐車場が狭い"、"次回は別アングルで撮りたい"

- **`comment`**: 公開コメント（他のユーザーも閲覧可能 - 将来実装時）
  - 例: "ピカチュウのデザインがかわいい！"、"雨の日は滑りやすいので注意"

#### マイグレーション

```sql
ALTER TABLE visit ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS comment TEXT;
```

---

### 2. manhole_comment テーブル（新規）

マンホール詳細ページでのコメント機能用。訪問記録とは独立したコメントシステム。

#### スキーマ

```sql
CREATE TABLE manhole_comment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manhole_id INTEGER NOT NULL REFERENCES manhole(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES manhole_comment(id) ON DELETE CASCADE,
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### カラム説明

| カラム名 | 説明 |
|---------|------|
| `manhole_id` | コメント対象のマンホールID |
| `user_id` | コメント投稿者 |
| `content` | コメント本文 |
| `parent_comment_id` | 親コメントID（返信機能用、NULLの場合はトップレベルコメント） |
| `is_edited` | 編集済みフラグ |
| `edited_at` | 最終編集日時 |

#### ユースケース

1. **トップレベルコメント**: `parent_comment_id = NULL`
   - 例: "このデザイン素敵ですね！"

2. **返信コメント**: `parent_comment_id = 親コメントのUUID`
   - 例: "@ユーザー名 同感です！"

#### RLSポリシー

- **SELECT**: 全員が閲覧可能（`USING (true)`）
- **INSERT**: 認証済みユーザーのみ、自分のuser_idでのみ作成可能
- **UPDATE**: 自分のコメントのみ編集可能
- **DELETE**: 自分のコメントのみ削除可能

---

### 3. reaction テーブル（新規）

いいね、ブックマーク、その他のリアクション機能用。

#### スキーマ

```sql
CREATE TABLE reaction (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  manhole_id INTEGER REFERENCES manhole(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, target_type, target_id, reaction_type),
  UNIQUE(user_id, target_type, manhole_id, reaction_type)
);
```

#### カラム説明

| カラム名 | 説明 | 例 |
|---------|------|-----|
| `target_type` | リアクション対象の種類 | 'manhole', 'visit', 'comment' |
| `target_id` | 対象のUUID | visitやcommentのUUID |
| `manhole_id` | マンホールID（target_type='manhole'の場合） | 1, 2, 3... |
| `reaction_type` | リアクションの種類 | 'like', 'bookmark', 'heart', 'wow' |

#### リアクションの種類（reaction_type）

| 種類 | アイコン | 説明 |
|-----|---------|------|
| `like` | ❤️ | いいね |
| `bookmark` | 🔖 | ブックマーク（お気に入り） |
| `heart` | 💖 | 大好き |
| `wow` | 😮 | すごい！ |
| `photo` | 📸 | 写真がきれい |

#### ユースケース

1. **マンホールにいいね**
   ```sql
   INSERT INTO reaction (user_id, target_type, manhole_id, reaction_type)
   VALUES ('user-uuid', 'manhole', 123, 'like');
   ```

2. **訪問記録にいいね**
   ```sql
   INSERT INTO reaction (user_id, target_type, target_id, reaction_type)
   VALUES ('user-uuid', 'visit', 'visit-uuid', 'like');
   ```

3. **コメントにいいね**
   ```sql
   INSERT INTO reaction (user_id, target_type, target_id, reaction_type)
   VALUES ('user-uuid', 'comment', 'comment-uuid', 'like');
   ```

#### 制約

- 同じユーザーが同じ対象に同じリアクションは**1回のみ**（UNIQUE制約）
- リアクションの取り消しは**DELETEで実装**（トグル式）

---

## 📊 ビューと集計関数

### 1. manhole_reaction_stats ビュー

マンホールごとのリアクション数を集計。

```sql
CREATE VIEW manhole_reaction_stats AS
SELECT
  manhole_id,
  reaction_type,
  COUNT(*) as count
FROM reaction
WHERE target_type = 'manhole' AND manhole_id IS NOT NULL
GROUP BY manhole_id, reaction_type;
```

**使用例:**
```sql
-- マンホールID=123のリアクション統計
SELECT * FROM manhole_reaction_stats WHERE manhole_id = 123;

-- 結果:
-- manhole_id | reaction_type | count
-- -----------|---------------|------
-- 123        | like          | 45
-- 123        | bookmark      | 12
```

### 2. manhole_comment_stats ビュー

マンホールごとのコメント数を集計。

```sql
CREATE VIEW manhole_comment_stats AS
SELECT
  manhole_id,
  COUNT(*) as comment_count,
  COUNT(DISTINCT user_id) as commenter_count
FROM manhole_comment
WHERE parent_comment_id IS NULL
GROUP BY manhole_id;
```

### 3. get_reaction_count() 関数

リアクション数を取得する便利関数。

```sql
-- マンホールID=123の全リアクション数
SELECT get_reaction_count('manhole', NULL, 123);

-- マンホールID=123の「いいね」のみ
SELECT get_reaction_count('manhole', NULL, 123, 'like');
```

### 4. user_has_reaction() 関数

ユーザーが特定のリアクションをしているか確認。

```sql
-- ユーザーがマンホールID=123に「いいね」しているか
SELECT user_has_reaction('user-uuid', 'manhole', NULL, 123, 'like');
-- 戻り値: true/false
```

---

## 🔄 実装フェーズ

### フェーズ1: 訪問時のコメント（即時実装）

#### 1.1 データベース

- [x] `visit.comment` カラム追加
- [x] `visit.is_public` カラム追加

#### 1.2 バックエンド

- [ ] `/api/visits` GET: commentを含めて返す
- [ ] `/api/visits` POST: commentを保存できるようにする
- [ ] `/api/image-upload` POST: commentを含めた訪問記録作成

#### 1.3 フロントエンド

- [ ] アップロードページにコメント入力欄を追加
- [ ] 訪問履歴ページでコメントを表示
- [ ] マンホール詳細ページで訪問時コメントを表示

#### UI例（アップロードページ）

```tsx
<div className="rpg-window mt-4">
  <h3 className="rpg-window-title">訪問コメント</h3>
  <textarea
    className="w-full p-3 border-2 border-rpg-border rounded"
    placeholder="このポケふたの感想を書こう！（任意）"
    rows={3}
    value={comment}
    onChange={(e) => setComment(e.target.value)}
  />
  <p className="text-xs text-gray-500 mt-1">
    ※ 個人メモは「メモ」欄に、公開したい感想はこちらに記入してください
  </p>
</div>
```

---

### フェーズ2: マンホール詳細コメント（将来実装）

#### 2.1 データベース

- [x] `manhole_comment` テーブル作成済み
- [x] RLSポリシー設定済み

#### 2.2 バックエンド

- [ ] `/api/manholes/[id]/comments` GET: コメント一覧取得
- [ ] `/api/manholes/[id]/comments` POST: コメント投稿
- [ ] `/api/comments/[id]` PUT: コメント編集
- [ ] `/api/comments/[id]` DELETE: コメント削除
- [ ] `/api/comments/[id]/reply` POST: 返信投稿

#### 2.3 フロントエンド

- [ ] マンホール詳細ページにコメント一覧表示
- [ ] コメント投稿フォーム
- [ ] コメント編集・削除機能
- [ ] 返信機能（スレッド表示）

---

### フェーズ3: リアクション機能（将来実装）

#### 3.1 データベース

- [x] `reaction` テーブル作成済み
- [x] RLSポリシー設定済み
- [x] 集計ビュー作成済み

#### 3.2 バックエンド

- [ ] `/api/reactions` POST: リアクション追加/削除（トグル）
- [ ] `/api/manholes/[id]/reactions` GET: リアクション統計取得
- [ ] `/api/reactions/me` GET: 自分のリアクション一覧

#### 3.3 フロントエンド

- [ ] マンホール詳細ページにリアクションボタン追加
- [ ] リアクション数表示
- [ ] 自分がリアクションしたかの表示
- [ ] ブックマーク一覧ページ

#### UI例

```tsx
<div className="flex gap-2">
  <button className={`rpg-button ${hasLiked ? 'active' : ''}`}>
    ❤️ いいね {likeCount}
  </button>
  <button className={`rpg-button ${hasBookmarked ? 'active' : ''}`}>
    🔖 保存 {bookmarkCount}
  </button>
</div>
```

---

## 🔒 セキュリティ考慮事項

### 1. RLS（Row Level Security）

- **必須**: すべてのテーブルでRLS有効化済み
- **原則**: 読み取りは公開、書き込みは自分のデータのみ

### 2. コンテンツモデレーション（将来実装）

- 不適切なコメントの報告機能
- 管理者によるコメント削除機能
- スパム対策（Rate Limiting）

### 3. プライバシー

- `visit.is_public = false` の場合、他のユーザーには非表示
- 個人メモ（note）は常に非公開

---

## 📈 パフォーマンス最適化

### 1. インデックス

すべての主要なクエリパターンにインデックスを設定済み：

- `manhole_comment(manhole_id, created_at DESC)`
- `reaction(target_type, target_id)`
- `reaction(user_id, target_type, manhole_id)`

### 2. キャッシング戦略

- リアクション数はビューで事前集計
- フロントエンドでSWRを使用してキャッシュ

---

## 🎯 まとめ

### 即時実装: 訪問時のコメント

1. データベースマイグレーション実行
   ```bash
   # Supabase SQL Editorで実行
   database/migrations/002_add_comment_and_reaction_tables.sql
   ```

2. バックエンドAPI修正
   - `/api/visits` でcommentを含める
   - `/api/image-upload` でcommentを保存

3. フロントエンドUI追加
   - アップロードページにコメント入力欄
   - 訪問履歴でコメント表示

### 将来実装の準備完了

- マンホール詳細コメント機能のテーブル・RLS設定済み
- リアクション機能のテーブル・RLS設定済み
- 集計ビューと便利関数も実装済み

必要なときにすぐAPIとUIを追加できる状態です！
