# 都道府県バッジシステム 実装ガイド

## 実装完了内容

### 1. データベース層

**ファイル**: `/database/migrations/005_add_prefecture_badge_system.sql`

- ✅ `prefecture` テーブル作成（47都道府県マスタ）
- ✅ `prefecture_badge` テーブル作成（バッジ履歴追跡）
- ✅ `app_user` テーブ拡張（グローバルバッジフラグ）
- ✅ `prefecture_completion_tracker` ビュー作成（リアルタイム完成度計算）
- ✅ `update_prefecture_badges_on_manhole_add()` トリガー関数（新規マンホール対応）
- ✅ `create_prefecture_badge()` 関数（バッジ作成）
- ✅ `check_and_update_all_prefectures_completion()` 関数（グローバルバッジチェック）
- ✅ RLS ポリシー設定
- ✅ インデックス作成

**特徴:**
- manhole.prefecture (文字列)との互換性対応
- 新規マンホール追加時の自動 outdated 処理
- バッジ履歴保管（複数レコード対応）

---

### 2. TypeScript型定義

**ファイル**: `/src/types/database.ts`

- ✅ `app_user` テーブ拡張
  - `all_prefectures_completed_at`
  - `all_prefectures_outdated_at`

- ✅ `prefecture` テーブル型定義

- ✅ `prefecture_badge` テーブル型定義

- ✅ `prefecture_completion_tracker` ビュー型定義

- ✅ `create_prefecture_badge()` 関数型定義

- ✅ `check_and_update_all_prefectures_completion()` 関数型定義

---

### 3. API層

#### 3.1 都道府県バッジ取得・チェック

**ファイル**: `/src/app/api/badges/prefectures/route.ts`

```
GET /api/badges/prefectures?includeOutdated=true
```

**レスポンス:**
```json
{
  "badges": [
    {
      "badgeId": "...",
      "prefectureId": 13,
      "name": "東京都",
      "status": "active",
      "totalManholes": 100,
      "visitedCount": 100,
      "currentCompletion": 100,
      "acquiredAt": "2025-05-01T...",
      "snapshotTotalManholes": 100
    }
  ],
  "globalBadge": {
    "completedAt": "2025-05-05T...",
    "outdatedAt": null,
    "totalActiveCount": 47,
    "isComplete": true
  },
  "summary": {
    "total": 47,
    "active": 47,
    "outdated": 0,
    "unearned": 0
  }
}
```

```
POST /api/badges/prefectures
```

**リクエストボディ:**
```json
{
  "prefectureId": 13
}
```

**レスポンス:**
```json
{
  "badgeCreated": true,
  "badgeId": "...",
  "completionPercentage": 100,
  "message": "Badge created for prefecture 13!"
}
```

---

#### 3.2 グローバルバッジ取得

**ファイル**: `/src/app/api/badges/global/route.ts`

```
GET /api/badges/global
```

**レスポンス:**
```json
{
  "isComplete": true,
  "completedAt": "2025-05-05T12:34:56.789Z",
  "outdatedAt": null,
  "activeCount": 47,
  "totalPrefectures": 47,
  "remainingCount": 0,
  "remainingPrefectures": [],
  "status": "complete"
}
```

---

### 4. フロントエンド層

#### 4.1 Hooks

**ファイル**: `/src/lib/hooks/usePrefectureBadges.ts`

**提供フック:**

1. **`usePrefectureBadges(includeOutdated?)`**
   - 全都道府県バッジ取得
   - 戻り値: `{ badges, globalBadge, summary, loading, error, refetch }`

2. **`useGlobalBadge()`**
   - グローバルバッジ情報取得
   - 戻り値: `{ isComplete, activeCount, status, remainingCount, remainingPrefectures, ... }`

3. **`useCheckPrefectureBadge()`**
   - 特定都道府県のバッジチェック＆作成
   - 戻り値: `{ check, loading, error }`

---

#### 4.2 UI コンポーネント

**ファイル**: `/src/components/PrefectureBadgeDisplay.tsx`

**提供コンポーネント:**

1. **`<PrefectureBadgeDisplay badge={badge} />`**
   - 単一都道府県バッジの表示
   - ステータス表示（達成/古い）
   - プログレスバー
   - 新規マンホール数表示

   ```tsx
   <PrefectureBadgeDisplay 
     badge={{
       badgeId: "...",
       name: "東京都",
       status: "active",
       currentCompletion: 100,
       ...
     }}
   />
   ```

2. **`<PrefectureBadgesGrid showOutdated={true} />`**
   - グリッド形式で全バッジを表示
   - レスポンシブ対応（2-4列）

   ```tsx
   <PrefectureBadgesGrid showOutdated={true} className="mb-4" />
   ```

3. **`<GlobalBadgeDisplay />`**
   - グローバルバッジの表示
   - 進捗プログレスバー
   - ステータス表示（達成/再チャレンジ/進行中）

   ```tsx
   <GlobalBadgeDisplay className="mb-4" />
   ```

4. **`<BadgeSummary />`**
   - バッジ進捗サマリー（達成/古い/未達成）
   - コンパクト表示

   ```tsx
   <BadgeSummary className="mb-4" />
   ```

---

## 使用例

### 例1: プロフィールページにバッジを表示

```tsx
'use client';

import { GlobalBadgeDisplay, PrefectureBadgesGrid } from '@/components/PrefectureBadgeDisplay';

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <h2>バッジ</h2>
      
      <GlobalBadgeDisplay />
      
      <div>
        <h3>都道府県バッジ</h3>
        <PrefectureBadgesGrid showOutdated={true} />
      </div>
    </div>
  );
}
```

### 例2: 訪問完了時にバッジをチェック

```tsx
'use client';

import { useCheckPrefectureBadge } from '@/lib/hooks/usePrefectureBadges';

export function ManholeVisitCard({ manhole }) {
  const { check } = useCheckPrefectureBadge();

  const handleVisitComplete = async () => {
    // 訪問記録...
    
    // バッジをチェック
    try {
      const result = await check(13); // 東京都
      if (result.badgeCreated) {
        // 🎉 バッジ獲得通知
        alert(`🎖️ ${manhole.prefecture} バッジ獲得！`);
      }
    } catch (error) {
      console.error('Badge check failed:', error);
    }
  };

  return (
    <button onClick={handleVisitComplete}>
      訪問記録
    </button>
  );
}
```

### 例3: ダッシュボードでバッジ進捗を表示

```tsx
'use client';

import { BadgeSummary, GlobalBadgeDisplay } from '@/components/PrefectureBadgeDisplay';

export default function Dashboard() {
  return (
    <div className="rpg-window p-4">
      <h2>あなたの進捗</h2>
      <BadgeSummary className="mb-4" />
      <GlobalBadgeDisplay />
    </div>
  );
}
```

---

## ワークフロー詳細

### シナリオA: ユーザーが都道府県を完成させる

```
1. ユーザーが都道府県内の最後のマンホール訪問
   ↓
2. バックエンド: visit テーブルに INSERT
   ↓
3. フロントエンド: useCheckPrefectureBadge().check(prefectureId)
   ↓
4. API: POST /api/badges/prefectures → create_prefecture_badge() 実行
   ↓
5. DB: prefecture_badge レコード作成（status='active'）
   ↓
6. DB: check_and_update_all_prefectures_completion() 実行
   ↓
7. レスポンス: { badgeCreated: true, badgeId: "..." }
   ↓
8. UI: 🎖️ バッジ獲得表示
```

### シナリオB: 新規マンホール追加で古くなる

```
1. 管理者が新マンホール追加
   ↓
2. DB: INSERT manhole → トリガー実行
   ↓
3. トリガー: update_prefecture_badges_on_manhole_add()
   ↓
4. DB: 該当都道府県の全アクティブバッジを outdated に変更
   ↓
5. DB: 該当ユーザーの all_prefectures_outdated_at を更新
   ↓
6. フロントエンド: usePrefectureBadges.refetch()
   ↓
7. UI: 🔄 古いバッジ表示 + 新マンホール数表示
   ↓
8. ユーザー: 新マンホール訪問 → バッジ復活
```

---

## パフォーマンス最適化

### インデックス

```sql
CREATE INDEX idx_prefecture_badge_user_id ON prefecture_badge(user_id);
CREATE INDEX idx_prefecture_badge_prefecture_id ON prefecture_badge(prefecture_id);
CREATE INDEX idx_prefecture_badge_status ON prefecture_badge(status);
CREATE INDEX idx_prefecture_badge_user_status ON prefecture_badge(user_id, status);
```

### キャッシング戦略

推奨: React Query または SWR で API レスポンスをキャッシュ

```tsx
import useSWR from 'swr';

export function usePrefectureBadgesOptimized() {
  const { data, isLoading } = useSWR(
    '/api/badges/prefectures',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1分間はキャッシュ
    }
  );
  return { data, isLoading };
}
```

---

## マイグレーション実行

```bash
# Supabase CLI を使用
supabase db push

# または直接 SQL 実行
psql postgresql://user:password@db.example.com/pokefuta < database/migrations/005_add_prefecture_badge_system.sql
```

---

## テスト例

### ユニットテスト

```typescript
import { createPrefectureBadge } from '@/lib/api/badges';

describe('Prefecture Badge System', () => {
  it('should create badge when all manholes visited', async () => {
    const result = await createPrefectureBadge(userId, prefectureId);
    expect(result.badgeCreated).toBe(true);
  });

  it('should not create badge if not all visited', async () => {
    const result = await createPrefectureBadge(userId, prefectureIdWithUnvisited);
    expect(result.badgeCreated).toBe(false);
  });
});
```

### E2Eテスト

```typescript
it('should complete prefecture and show badge', async () => {
  // 訪問記録...
  
  // バッジ取得
  const badges = await page.locator('[data-testid="prefecture-badge"]');
  expect(await badges.count()).toBeGreaterThan(0);
  
  // グローバルバッジ確認
  const globalBadge = await page.locator('[data-testid="global-badge"]');
  expect(await globalBadge.isVisible()).toBe(true);
});
```

---

## 今後の拡張

1. **リーダーボード**: 全国制覇ユーザーのランキング
2. **バッジレベル**: 複数完成度でレベルアップ
3. **シーズン**: 期間限定バッジ
4. **エリア制覇**: 地方別バッジ
5. **通知**: バッジ古い化の通知機能
6. **統計**: バッジ取得速度ランキング
