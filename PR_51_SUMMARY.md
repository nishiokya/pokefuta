# PR #51: orphan visit 修正 - 実装完了サマリー

**作業日**: 2026-05-10

## 実装内容

### 1. orphan visit の根本原因排除 ✅

#### 問題
- signup 時に `auth.users` は作成されるが、`app_user` 作成が失敗するケースが存在
- 結果、`app_user` が存在しない auth.users レコードが orphan 化

#### 原因
- RLS ポリシー `WITH CHECK (auth.uid() = auth_uid)` の評価時、ブラウザクライアントのセッションコンテキストが不安定

#### 対策
- signup を 2 段階化：
  1. **signup フェーズ**: `auth.signUp()` のみ（`auth.users` 作成）
  2. **初回ユース時**: `ensureAppUser()` で `app_user` 自動作成

### 2. 共通ユーティリティ実装 ✅

**ファイル**: `src/lib/auth/ensureAppUser.ts`

```typescript
export async function ensureAppUser(
  supabase: SupabaseClient<any>,
  userId: string,
  email?: string
): Promise<boolean>
```

**機能**:
- `app_user` 存在確認
- 存在しない場合、自動作成
- エラーは log のみ（operation を block しない）

**呼び出し元**:
- `POST /api/image-upload` - 写真アップロード時
- `POST /api/visits/{id}/like` - いいね時
- `POST /api/visits/{id}/bookmark` - ブックマーク時
- `POST /api/visits/{id}/comments` - コメント時

### 3. signup フロー簡素化 ✅

**変更**: `src/app/signup/page.tsx`

```typescript
// Before: auth.users + app_user 両方作成
const { error: signUpError } = await supabase.auth.signUp({...});
const { error: profileError } = await supabase.from('app_user').insert({...});

// After: auth.users のみ
const { error: signUpError } = await supabase.auth.signUp({...});
// app_user は初回ユース時に自動作成される
```

**効果**:
- signup 画面の error handling 简素化
- RLS ポリシー評価の context 問題排除

### 4. 削除した未使用 API ✅

| API | 理由 |
|-----|------|
| `POST /api/visits` | UI から呼ばれない（訪問は photo upload 時のみ） |
| `GET /api/rankings/users` | 未実装（empty folder） |
| `GET /api/photo-stats` | 未使用（統計表示に使用されない） |

### 5. display_name の管理（現在の実装）

| タイミング | 場所 | 値 |
|-----------|------|-----|
| **signup 時** | `auth.users.user_metadata.display_name` | ユーザー入力 |
| **初回ユース時** | `app_user.display_name` | `auth.users` から自動コピー |
| **UI 表示** | `auth.users.user_metadata` (優先) 或 email 抽出 | - |

**注**: 別 ISSUE で、app_user を単一の真実の源にするか検討予定（ISSUES_TO_DISCUSS.md 参照）

---

## テスト確認 ✅

```
[✓] 新規ユーザー signup
    └─ auth.users 作成

[✓] 初回写真アップロード
    └─ app_user 自動作成（ensureAppUser）

[✓] 写真アップロード後、いいね・ブックマーク
    └─ app_user が存在するため正常動作

[✓] display_name 表示
    └─ UI に反映確認
```

---

## 今後の検討事項

### 別 PR で対応予定

1. **プロフィール編集機能** (`/profile/edit` ページ)
   - display_name 変更 API
   - avatar_url 変更 API

2. **display_name 管理方法の統一**
   - auth.users vs app_user の一本化
   - ISSUES_TO_DISCUSS.md 参照

---

## ファイル変更一覧

```
新規作成:
+ src/lib/auth/ensureAppUser.ts
+ ISSUES_TO_DISCUSS.md
+ ORPHAN_VISIT_CLEANUP.md（修復手順書）

修正:
~ src/app/signup/page.tsx（app_user INSERT 削除）
~ src/app/api/image-upload/route.ts（ensureAppUser 導入）
~ src/app/api/visits/[id]/like/route.ts（ensureAppUser 導入）
~ src/app/api/visits/[id]/bookmark/route.ts（ensureAppUser 導入）
~ src/app/api/visits/[id]/comments/route.ts（ensureAppUser 導入）

削除:
- src/app/api/visits/route.ts（POST ハンドラ）
- src/app/api/rankings/users/
- src/app/api/photo-stats/route.ts
```

---

## orphan visit 修復（管理者向け）

既存の orphan visit を修復するには、`ORPHAN_VISIT_CLEANUP.md` の手順に従い、migration SQL を実行してください。

```bash
psql -f database/migrations/006_fix_orphan_visits.sql
```

修復完了後、orphan visit 検出クエリで確認できます。
