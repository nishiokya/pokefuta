# 都道府県バッジシステム 実装チェックリスト

## ✅ 実装完了項目

### データベース層
- [x] `prefecture` マスタテーブル作成
- [x] `prefecture_badge` テーブル作成（ステータス管理）
- [x] `app_user` テーブ拡張（グローバルバッジフラグ）
- [x] `prefecture_completion_tracker` ビュー作成
- [x] `update_prefecture_badges_on_manhole_add()` トリガー関数
- [x] `create_prefecture_badge()` 関数
- [x] `check_and_update_all_prefectures_completion()` 関数
- [x] RLS ポリシー設定
- [x] インデックス作成
- [x] 47都道府県初期データ INSERT
- [x] マイグレーション 005 作成完了

### TypeScript型定義
- [x] `app_user` Row/Insert/Update 型更新
- [x] `prefecture` テーブル型定義
- [x] `prefecture_badge` テーブル型定義
- [x] `prefecture_completion_tracker` ビュー型定義
- [x] 関数型定義（`create_prefecture_badge`, `check_and_update_all_prefectures_completion`）

### API層
- [x] `GET /api/badges/prefectures` - バッジ取得エンドポイント
- [x] `POST /api/badges/prefectures` - バッジチェック＆作成エンドポイント
- [x] `GET /api/badges/global` - グローバルバッジ取得エンドポイント
- [x] 認証チェック＆RLS対応
- [x] エラーハンドリング

### フロントエンド層（Hooks）
- [x] `usePrefectureBadges()` - 全バッジ取得 Hook
- [x] `useGlobalBadge()` - グローバルバッジ取得 Hook
- [x] `useCheckPrefectureBadge()` - バッジチェック Hook

### UI コンポーネント
- [x] `PrefectureBadgeDisplay` - 単一バッジ表示
- [x] `PrefectureBadgesGrid` - グリッド表示
- [x] `GlobalBadgeDisplay` - グローバルバッジ表示
- [x] `BadgeSummary` - サマリー表示
- [x] RPG スタイル CSS クラス対応
- [x] ステータス表示（達成/古い/未達成）
- [x] プログレスバー表示
- [x] 新規マンホール表示

### ドキュメント
- [x] 設計ドキュメント (`PREFECTURE_BADGE_DESIGN.md`)
- [x] 実装ガイド (`PREFECTURE_BADGE_IMPLEMENTATION.md`)
- [x] チェックリスト（本ファイル）

---

## 📋 次のステップ

### 即座に実行すべき項目

1. **マイグレーション実行**
   ```bash
   supabase db push
   # または
   psql <db_url> < database/migrations/005_add_prefecture_badge_system.sql
   ```

2. **型定義を Supabase から再生成**
   ```bash
   npx supabase gen types typescript --project-id <project-id> > src/types/database.ts
   ```
   （手動編集部分は保持）

3. **環境テスト**
   - [ ] 開発環境でマイグレーション実行確認
   - [ ] `prefecture` テーブルに47都道府県が INSERT されたか確認
   - [ ] API エンドポイントの動作確認
   - [ ] Hook の動作確認

4. **フロントエンドへの統合**
   - [ ] Header コンポーネントにバッジ表示を追加
   - [ ] プロフィールページにバッジセクション追加
   - [ ] ダッシュボードにバッジ進捗を表示
   - [ ] 訪問完了時にバッジチェック機能を統合

---

## 🧪 テスト実行項目

### 手動テスト

**シナリオ1: バッジ獲得**
```
1. ユーザー A が東京都の全マンホール訪問
2. API POST /api/badges/prefectures でチェック
3. prefecture_badge に新レコード作成を確認
4. UI に "🎖️ 東京都" が表示されることを確認
```

**シナリオ2: バッジが古くなる**
```
1. 東京都に新マンホール追加（INSERT manhole）
2. トリガー実行確認
3. prefecture_badge.status が 'active' → 'outdated' に変更
4. UI に "🔄 古い" 表示と新マンホール数が表示されることを確認
```

**シナリオ3: グローバルバッジ**
```
1. ユーザー B が47都道府県全てを完成
2. all_prefectures_completed_at が設定される
3. GET /api/badges/global で isComplete=true を確認
4. UI に "✨ 全国制覇達成" が表示されることを確認
```

**シナリオ4: 古くなった後の再獲得**
```
1. ユーザー C が東京都を達成（status='active'）
2. 東京都に新マンホール追加（status='outdated'）
3. ユーザー C が新マンホール訪問
4. 新しい prefecture_badge レコード作成確認
5. status='active' の新レコードが存在することを確認
6. 古いレコード（outdated）も履歴として残されることを確認
```

### 自動テスト（推奨）

```typescript
// __tests__/api/badges.test.ts

describe('Prefecture Badge API', () => {
  it('GET /api/badges/prefectures - should return user badges', async () => {
    const response = await fetch('/api/badges/prefectures');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('badges');
    expect(data).toHaveProperty('globalBadge');
    expect(data).toHaveProperty('summary');
  });

  it('POST /api/badges/prefectures - should create badge on completion', async () => {
    const response = await fetch('/api/badges/prefectures', {
      method: 'POST',
      body: JSON.stringify({ prefectureId: 13 }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('badgeCreated');
    expect(data).toHaveProperty('badgeId');
  });

  it('GET /api/badges/global - should return global badge status', async () => {
    const response = await fetch('/api/badges/global');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('isComplete');
    expect(data).toHaveProperty('activeCount');
    expect(data.activeCount).toBeLessThanOrEqual(47);
  });
});
```

---

## 🔍 検証項目

### データベース検証

```sql
-- 1. prefecture テーブル確認
SELECT COUNT(*) FROM prefecture;  -- 47 であることを確認

-- 2. prefecture_badge テーブル確認
SELECT * FROM prefecture_badge WHERE status='active' LIMIT 5;

-- 3. ビュー動作確認
SELECT * FROM prefecture_completion_tracker WHERE user_id='<user_id>' LIMIT 5;

-- 4. トリガー確認
SELECT trigger_name FROM information_schema.triggers WHERE table_name='manhole';
```

### API 検証

```bash
# 1. バッジ取得
curl -X GET 'http://localhost:3000/api/badges/prefectures' \
  -H 'Authorization: Bearer <token>'

# 2. バッジチェック
curl -X POST 'http://localhost:3000/api/badges/prefectures' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"prefectureId": 13}'

# 3. グローバルバッジ
curl -X GET 'http://localhost:3000/api/badges/global' \
  -H 'Authorization: Bearer <token>'
```

### フロントエンド検証

- [ ] Hook の戻り値が正しいか
- [ ] コンポーネントが正しくレンダリングされているか
- [ ] レスポンシブデザイン対応か
- [ ] ローディング状態表示されるか
- [ ] エラーメッセージ表示されるか
- [ ] キャッシング動作は適切か

---

## 🚀 デプロイ前チェックリスト

- [ ] マイグレーション SQL が正しく実行できる
- [ ] すべての API エンドポイント動作確認
- [ ] UI コンポーネント統合テスト完了
- [ ] E2E テスト成功
- [ ] パフォーマンス測定（API 応答時間 < 500ms）
- [ ] セキュリティ確認（RLS ポリシー機能）
- [ ] データベースバックアップ
- [ ] ロールバック手順確認

---

## ⚠️ 既知の制限事項

1. **manhole.prefecture が文字列**
   - 現在は prefecture テーブルとの参照化ではなく、ビュー内で名前マッチング
   - 将来的には manhole テーブルに prefecture_id 追加を検討

2. **リアルタイム更新**
   - API レスポンスはキャッシュされるため、リアルタイム性が低い
   - 必要に応じて Supabase Realtime または WebSocket 導入

3. **バッチ処理**
   - 複数ユーザーが同時に完成しても逐次処理
   - 大規模環境ではスケーリング検討

---

## 📞 サポート

問題が発生した場合：

1. **SQL エラー**
   - `database/migrations/005_add_prefecture_badge_system.sql` の実行ログ確認
   - 構文エラーがないか確認

2. **API エラー**
   - ブラウザ DevTools → Network タブでレスポンス確認
   - サーバーログで詳細エラー確認

3. **フロントエンド**
   - React DevTools で Hook の戻り値確認
   - ネットワークリクエスト確認

---

最終確認日時: 2026-05-05
実装ステータス: ✅ 完了（テスト前）
