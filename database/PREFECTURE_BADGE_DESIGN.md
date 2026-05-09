# 都道府県バッジシステム 設計ドキュメント

## 概要

都道府県のマンホールを全て見たユーザーに対して、「都道府県完全制覇バッジ」を授与するシステム。新しいマンホールが追加された場合、既存のバッジを「古い」状態に遷移させ、ユーザーの成果を失わないようにしながらチャレンジ精神を保つ設計。

## テーブル設計

### 1. `prefecture` テーブル（都道府県マスタ）

都道府県情報を正規化・一元管理。

```sql
CREATE TABLE prefecture (
  id SERIAL PRIMARY KEY,
  code VARCHAR(2) UNIQUE NOT NULL,      -- 都道府県コード（01-47）
  name VARCHAR(10) NOT NULL UNIQUE,    -- 都道府県名（例：北海道）
  name_en VARCHAR(50),                 -- 英語名
  display_order INT NOT NULL,          -- 表示順序（1-47）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**特徴:**
- マンホールテーブルの `prefecture` (文字列)と参照化可能
- 拡張性：新規都道府県追加時も対応（例：特別区域など）
- 47都道府県を初期データとして登録

---

### 2. `prefecture_badge` テーブル（ユーザー・都道府県バッジ記録）

ユーザーがある都道府県の全マンホールを見たことを記録。バッジの履歴を追跡。

```sql
CREATE TABLE prefecture_badge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  prefecture_id INTEGER NOT NULL REFERENCES prefecture(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'outdated', 'completed')),
  
  -- ステータスの説明：
  -- - active: 現在保有中のバッジ
  -- - outdated: 以前は達成したが、新マンホール追加で古くなったバッジ
  -- - completed: 完了フラグ（履歴保管用）
  
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- バッジ獲得日時
  outdated_at TIMESTAMPTZ,                         -- 古くなった日時
  
  -- スナップショット：バッジ獲得時点のデータ
  completion_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100,
  manhole_count_at_completion INT NOT NULL DEFAULT 0,
  visited_manhole_count INT NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_active_badge_per_user_prefecture UNIQUE (user_id, prefecture_id, status) WHERE status = 'active'
);
```

**重要な制約:**
- `UNIQUE(user_id, prefecture_id, status='active')`: ユーザーが各都道府県で最大1つのアクティブバッジ
- 複数レコード可：同じユーザー・都道府県でも outdated と active が別々に存在可能
- スナップショット：完成度をバッジ獲得時に記録（後でマンホール追加しても差異を表現可能）

---

### 3. `app_user` テーブ 拡張

グローバルなバッジ状態を追跡。

```sql
ALTER TABLE app_user 
ADD COLUMN IF NOT EXISTS all_prefectures_completed_at TIMESTAMPTZ,  -- 全47都道府県制覇日時
ADD COLUMN IF NOT EXISTS all_prefectures_outdated_at TIMESTAMPTZ;   -- 任意が古くなった日時
```

**用途:**
- `all_prefectures_completed_at NOT NULL` → グローバルバッジ獲得
- `all_prefectures_outdated_at NOT NULL` → 「再チャレンジ中」状態を表現

---

## ビュー・関数設計

### 4. `prefecture_completion_tracker` ビュー

各ユーザーの都道府県ごとの完成度を**自動計算**。

```sql
SELECT
  badge_id,                              -- prefecture_badge のID（NULL = まだバッジなし）
  user_id,
  prefecture_id,
  code, name, name_en,                   -- 都道府県情報
  status,                                -- 'active', 'outdated', NULL
  total_manholes_now,                    -- 現在の総マンホール数（新規追加対応）
  visited_manholes_count,                -- ユーザーが訪問した数
  current_completion_percentage,         -- 最新の完成度（%）
  acquired_at, outdated_at,
  manhole_count_at_completion,           -- バッジ獲得時の総数
  visited_manhole_count,                 -- バッジ獲得時の訪問数
  completion_percentage                  -- バッジ獲得時の完成度（%）
FROM prefecture_completion_tracker;
```

**特徴:**
- `total_manholes_now` vs `manhole_count_at_completion` の差分 → 新規追加数が分かる
- `current_completion_percentage` vs `completion_percentage` → 古くなった度合いを計算可能
- **定期的に参照**: ダッシュボードにリアルタイム表示可能

---

### 5. `create_prefecture_badge()` 関数

ユーザーが都道府県内の全マンホールを訪問したかチェック＋バッジ作成。

```sql
SELECT create_prefecture_badge(
  user_id,       -- ユーザーID
  prefecture_id  -- 都道府県ID
) AS badge_id;  -- 作成されたバッジのID
```

**処理フロー:**
1. 指定都道府県の総マンホール数を計数
2. ユーザーが訪問した distinct マンホール数を計数
3. 100% 完成（全訪問）ならバッジ作成
4. グローバルバッジチェック呼び出し

**戻り値:** 新規バッジのID（失敗時は NULL）

---

### 6. `check_and_update_all_prefectures_completion()` 関数

ユーザーが全47都道府県を制覇したかチェック。

```sql
SELECT check_and_update_all_prefectures_completion(user_id);
```

**処理:**
1. アクティブバッジ数を計数
2. バッジ数 = 47 なら `app_user.all_prefectures_completed_at` を更新
3. `all_prefectures_outdated_at` をクリア

---

### 7. `update_prefecture_badges_on_manhole_add()` トリガー関数

**新規マンホール INSERT 時に自動実行**

```sql
TRIGGER trigger_update_badges_on_manhole_add
AFTER INSERT ON manhole
FOR EACH ROW
EXECUTE FUNCTION update_prefecture_badges_on_manhole_add();
```

**処理:**
1. 新マンホールの都道府県で status='active' のバッジを outdated に変更
2. 該当ユーザーの `all_prefectures_outdated_at` を更新
3. グローバルバッジを剥奪（再チャレンジへ）

---

## ワークフロー例

### シナリオ：ユーザーが東京都の全マンホール訪問

```
1. ユーザーが東京都の最後のマンホールを訪問
   → visit テーブルに INSERT

2. 定期的に check_prefecture_completion() が呼ばれる（またはバックエンド処理）
   → "東京都の訪問数 = 東京都の総マンホール数" → true

3. create_prefecture_badge(user_id, tokyo_prefecture_id) 実行
   → prefecture_badge レコード作成（status='active'）
   → 他の46都道府県も同様にチェック

4. check_and_update_all_prefectures_completion(user_id) 実行
   → アクティブバッジが47個 → all_prefectures_completed_at 設定
   → ✨グローバルバッジ獲得
```

### シナリオ：マンホール追加で古くなる

```
1. 管理者が東京都に新マンホール追加
   → manhole テーブルに INSERT

2. トリガー自動実行
   → prefecture_badge WHERE prefecture_id=tokyo AND status='active'
   → status を 'outdated' に変更、outdated_at 設定

3. 全東京都バッジ保有者の all_prefectures_outdated_at を更新
   → UI: "🎖️ 東京都（古い - 再チャレンジ中）"

4. ユーザーが新マンホール訪問
   → 完成度: 99% → 100% に更新
   → 新しいバッジ作成 → all_prefectures_completed_at 再設定
   → ✨バッジ復活 & 再獲得ログ記録
```

---

## RLS ポリシー

`prefecture_badge` は認証ユーザーのみアクセス可能。

```sql
-- SELECT: 自分のバッジのみ表示
WHERE auth.uid() = user_id

-- INSERT: 自分のバッジのみ作成（実装では関数経由）
WITH CHECK (auth.uid() = user_id)

-- UPDATE: 自分のバッジのみ更新（但し関数経由が推奨）
USING (auth.uid() = user_id)
```

---

## インデックス

パフォーマンス最適化：

```sql
CREATE INDEX idx_prefecture_badge_user_id ON prefecture_badge(user_id);
CREATE INDEX idx_prefecture_badge_prefecture_id ON prefecture_badge(prefecture_id);
CREATE INDEX idx_prefecture_badge_status ON prefecture_badge(status);
CREATE INDEX idx_prefecture_badge_user_status ON prefecture_badge(user_id, status);
```

---

## 初期データ

`prefecture` テーブルに47都道府県を INSERT（コード + 名前 + 表示順）

---

## 今後の拡張案

1. **バッジレベル**: 例「🥈 東京都を3回完成」= Bronze/Silver/Gold
2. **タイムトライアル**: 「〇日で全国制覇」統計
3. **エリア制覇**: 関東地方7県 + 近畿地方など地域ごともバッジ化
4. **シーズン**: 「2025年春シーズン全都道府県制覇」
5. **通知**: outdated → UI通知「新マンホール見つかりました！」
6. **ランキング**: 全国制覇ユーザーのランキング
