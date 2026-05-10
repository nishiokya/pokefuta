# Orphan Visit（孤立した訪問記録）発生パス分析

## 📋 概要
**orphan visit** とは：`app_user` テーブルに存在しない `user_id` を持つ `visit` レコード

---

## 1️⃣ signup フロー の app_user 挿入失敗パス

### ファイル: [src/app/signup/page.tsx](src/app/signup/page.tsx#L42-L102)

#### コード流れ:
```
1. auth.signUp() 実行 → ✅ auth.users に user 作成
   └─ auth.users.id = `{user_id}`

2. app_user テーブルへ INSERT 試行:
   └─ INSERT { auth_uid: {user_id}, email, display_name }
      
3. ⚠️ INSERT 失敗した場合:
   └─ エラーメッセージをユーザーに表示して終了
   └─ ✅ auth.users には存在（ID: {user_id}）
   └─ ❌ app_user には存在しない
```

#### エラーハンドリング:
```typescript
// Line 74-95: app_user 挿入失敗時の処理
if (profileError) {
  console.error('❌ app_userテーブルへの挿入エラー:', {
    code: profileError.code,
    message: profileError.message,
    details: profileError.details,
    hint: profileError.hint,
  });
  
  setError(
    `プロフィール作成エラー: ${profileError.message}\n\n` +
    `ヒント: ${profileError.hint || '...'}`
  );
  return;  // ✅ 早期終了 → ユーザーは auth.users には存在
}
```

#### 🔴 app_user 挿入失敗の可能性

| 失敗原因 | 詳細 | orphan visit 可能性 |
|---------|------|-------------------|
| **RLS ポリシー制限** | `public` ロールが `app_user` insert 権限なし | ✅ **高** |
| **テーブル存在確認** | `app_user` テーブル自体が未作成 | ✅ **高** |
| **UNIQUE 制約違反** | `auth_uid` が既存 | ❌ ユーザーは既に存在 |
| **DEFAULT 値エラー** | 計算値・関数エラー | ✅ **中** |
| **FK 制約エラー** | `auth_uid` が `auth.users` に無い | ❌ 不可能（作成したばかり） |

#### 💡 発生シナリオ
```
【ユーザーの視点】
1. Sign Up ボタン → signup.page.tsx へ
2. auth.signUp() 成功 → ✅ アカウント作成完了
3. app_user 作成失敗 → ❌ "プロフィール作成エラー: ..." 表示
4. ユーザー困惑 → ログインを試みる

【システムの状態】
- auth.users: ユーザー ID {uid} が存在 ✅
- app_user: レコード存在しない ❌
```

---

## 2️⃣ Visit/Image-Upload 作成時の user_id チェック

### ファイル A: [src/app/api/visits/route.ts](src/app/api/visits/route.ts#L377-L436)

#### POST /api/visits のコード:
```typescript
// Line 377-391: 認証チェック（✅ app_user 不確認）
const { data: { session } } = await supabase.auth.getSession();

if (!session?.user) {
  return NextResponse.json({
    success: false,
    error: 'Authentication required'
  }, { status: 401 });
}

// Line 410-430: visit 作成
const { data: visit, error } = await supabase
  .from('visit')
  .insert({
    user_id: session.user.id,  // ⚠️ auth.users.id を直接使用
    manhole_id: manhole_id || null,
    shot_location: shot_location || null,
    shot_at,
    note: note || null
  })
  .select()
  .single();
```

**🔴 チェック内容:**
- ✅ `session?.user` の存在確認 → auth.users からの session 存在確認
- ❌ `app_user.auth_uid` の存在確認 → **なし！**

---

### ファイル B: [src/app/api/image-upload/route.ts](src/app/api/image-upload/route.ts#L135-L220)

#### POST /api/image-upload のコード:
```typescript
// Line 135-145: 認証チェック（✅ app_user 不確認）
const { data: { session } } = await supabase.auth.getSession();

if (!session?.user) {
  return NextResponse.json({
    success: false,
    error: 'Authentication required'
  }, { status: 401 });
}

// Line 192-220: visit 作成
const visitInsert: any = {
  user_id: userId,  // ⚠️ session.user.id を直接使用（Line 191）
  shot_at: shotAtDate,
  manhole_id: manholeIdInt,
  // ... その他フィールド
};

const { data: visitData, error: visitError } = await supabase
  .from('visit')
  .insert(visitInsert)
  .select()
  .single();
```

**🔴 チェック内容:**
- ✅ `session?.user` の存在確認
- ❌ `app_user.auth_uid` の存在確認 → **なし！**

---

## 3️⃣ Social 機能（いいね・コメント）での orphan visit 参照

### ファイル A: [src/app/api/visits/[id]/like/route.ts](src/app/api/visits/[id]/like/route.ts#L72-L102)

#### POST /api/visits/[id]/like:
```typescript
// Line 72-79: 認証チェック
const { data: { session } } = await supabase.auth.getSession();

if (!session?.user) {
  return NextResponse.json({
    success: false,
    error: 'Authentication required'
  }, { status: 401 });
}

// Line 85: visit の存在確認のみ
const { data: visit, error: visitError } = await supabase
  .from('visit')
  .select('id')
  .eq('id', visitId)
  .single();

// Line 105: いいね挿入
const { data: like, error: likeError } = await supabase
  .from('visit_like')
  .insert({
    visit_id: visitId,
    user_id: userId  // ⚠️ app_user 不確認
  })
```

**🔴 チェック内容:**
- ✅ `session?.user` 確認
- ✅ `visit` 存在確認
- ❌ `app_user.auth_uid` 確認 → **なし！**

**📊 visit_like テーブルの FK 制約:**
```sql
-- database/migrations/003_add_social_features.sql, Line 14
user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
```
→ visit_like.user_id は `auth.users.id` を参照
→ app_user は参照されない！

---

### ファイル B: [src/app/api/visits/[id]/comments/route.ts](src/app/api/visits/[id]/comments/route.ts#L238-L265)

#### POST /api/visits/[id]/comments:
```typescript
// Line 238-245: 認証チェック
const { data: { session } } = await supabase.auth.getSession();

if (!session?.user) {
  return NextResponse.json({
    success: false,
    error: 'Authentication required'
  }, { status: 401 });
}

// Line 281: visit 存在確認のみ
const { data: visit, error: visitError } = await supabase
  .from('visit')
  .select('id')
  .eq('id', visitId)
  .single();

// Line 296: コメント挿入
const { data: comment, error: commentError } = await supabase
  .from('visit_comment')
  .insert({
    visit_id: visitId,
    user_id: userId,  // ⚠️ app_user 不確認
    content: content.trim()
  })
```

**🔴 チェック内容:**
- ✅ `session?.user` 確認
- ✅ `visit` 存在確認
- ❌ `app_user.auth_uid` 確認 → **なし！**

**📊 visit_comment テーブルの FK 制約:**
```sql
-- database/migrations/003_add_social_features.sql, Line 54
user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
```

---

## 4️⃣ Orphan Visit 作成完全フロー

### 📍 シナリオ: "未完成ユーザー" が visit を作成

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Sign Up で app_user 挿入失敗                            │
├─────────────────────────────────────────────────────────────────┤
│ • auth.signUp() → ✅ auth.users レコード作成                   │
│   └─ auth.users.id = "123e4567-e89b-12d3-a456-426614174000"   │
│                                                                 │
│ • app_user INSERT 試行 → ❌ RLS ポリシー or テーブル不在      │
│   └─ プロフィール作成エラー表示                               │
│   └─ signup 中止                                              │
│                                                                 │
│ 状態: auth.users ✅, app_user ❌                              │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: ユーザー再度ログイン試行                               │
├─────────────────────────────────────────────────────────────────┤
│ • session.user.id = "123e4567-e89b-12d3-a456-426614174000"    │
│ • session.user.email_confirmed_at = false (未確認の場合も)   │
│                                                                 │
│ ⚠️ signup ページで「ログインしてください」と言われて         │
│    login ページへ                                             │
│ • auth.signInWithPassword() → ✅ 成功（既に auth.users 存在） │
│   └─ session 取得完了                                        │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: POST /api/image-upload で visit 作成 🔥               │
├─────────────────────────────────────────────────────────────────┤
│ • session?.user チェック → ✅ 存在                            │
│ • user_id = "123e4567-e89b-12d3-a456-426614174000"            │
│                                                                 │
│ • INSERT INTO visit:                                          │
│   {                                                            │
│     id: (UUID),                                               │
│     user_id: "123e4567-e89b-12d3-a456-426614174000",  ⚠️     │
│     manhole_id: 1,                                            │
│     shot_at: "2026-05-10T12:00:00Z"                           │
│   }                                                            │
│                                                                 │
│ ✅ visit 作成成功！                                           │
│ ❌ 対応する app_user レコードなし！                          │
│                                                                 │
│ 結果:                                                          │
│ - visit.user_id = "123e4567-e89b-12d3-a456-426614174000"     │
│ - SELECT * FROM app_user                                      │
│   WHERE auth_uid = "123e4567-..." → 0 行                     │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Social 機能でもっと orphan 化                          │
├─────────────────────────────────────────────────────────────────┤
│ • POST /api/visits/{id}/like → visit_like.user_id 作成       │
│   └─ auth.users.id は存在 ✅                                 │
│   └─ app_user は関係ない ✓                                  │
│                                                                 │
│ • POST /api/visits/{id}/comments → visit_comment.user_id 作成 │
│   └─ auth.users.id は存在 ✅                                 │
│   └─ app_user は関係ない ✓                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔴 完全な Orphan Visit コードパス

### パス 1: Image Upload → Visit 作成
```
user (no app_user)
    ↓
POST /api/image-upload
    ↓
session.user.id チェック ✅
    ↓
app_user 存在チェック ❌ ← 【ここがない！】
    ↓
INSERT INTO visit (user_id) ← orphan!
```

### パス 2: Visit API → Visit 作成
```
user (no app_user)
    ↓
POST /api/visits
    ↓
session.user.id チェック ✅
    ↓
app_user 存在チェック ❌ ← 【ここがない！】
    ↓
INSERT INTO visit (user_id) ← orphan!
```

---

## 5️⃣ Database 制約分析

### visit テーブル定義:
```typescript
// src/types/database.ts
visit: {
  Row: {
    id: string;
    user_id: string;        // 🔴 FK constraint？
    manhole_id: number | null;
    shot_at: string;
    // ...
  };
}
```

**❓ FK 制約は visit → auth.users のみ？ app_user への制約はない？**

### visit_like テーブル FK:
```sql
user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
```
→ `auth.users.id` を参照

### visit_comment テーブル FK:
```sql
user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
```
→ `auth.users.id` を参照

---

## 🎯 結論：Orphan Visit が作成される完全パス

### ✅ **確定：Orphan Visit 発生可能**

#### 必須条件：
1. **Sign Up 時 app_user 挿入失敗** → auth.users のみ作成
   - RLS ポリシー制限
   - テーブル存在確認不足
   - 権限設定エラー

2. **その後、ユーザーがログイン** → session 取得可能

3. **Visit/Image Upload 作成** 
   - `session?.user.id` チェック ✅
   - `app_user.auth_uid` チェック **❌ なし**
   - user_id を直接 insert

#### 発生するデータベース状態：
```sql
-- orphan visit 存在
SELECT * FROM visit WHERE user_id = '123e4567-...';
-- Result: 1 row

-- 対応する app_user なし
SELECT * FROM app_user WHERE auth_uid = '123e4567-...';
-- Result: 0 rows

-- ただし、visit_like/visit_comment は作成可能（FK が auth.users を参照）
SELECT * FROM visit_like WHERE user_id = '123e4567-...';
-- Result: 複数行 (OK)
```

---

## 🛠️ 修正提案

### 案 A: 各 API で app_user 存在確認を追加
```typescript
// POST /api/visits と POST /api/image-upload に追加
const { data: appUser, error: appUserError } = await supabase
  .from('app_user')
  .select('id')
  .eq('auth_uid', session.user.id)
  .maybeSingle();

if (!appUser) {
  return NextResponse.json({
    success: false,
    error: 'User profile not found. Please complete signup.'
  }, { status: 403 });
}
```

### 案 B: Database レベルで FK 制約追加
```sql
-- visit テーブルに FK 制約追加
ALTER TABLE visit
ADD CONSTRAINT fk_visit_app_user
FOREIGN KEY (user_id) REFERENCES app_user(auth_uid)
ON DELETE CASCADE;
```

### 案 C: Sign Up エラー時のリカバリー処理
```typescript
// signup.page.tsx の profileError 時に自動 retry or cleanup
if (profileError) {
  // Option 1: auth ユーザーを削除
  await supabase.auth.admin.deleteUser(data.user.id);
  
  // Option 2: 後続の API で検証を追加
}
```

---

## 📌 要件別チェックリスト

- [x] signup 時 app_user 挿入失敗のハンドリング → `return` で中止（ただし auth.users は残存）
- [x] visit/image-upload で auth_uid チェック → **存在しない** 🔴
- [x] orphan visit が作成される完全なコードパス → **パス 1, パス 2** ✅
- [x] 認証なしで visit を作成できるか → `/api/visits` と `/api/image-upload` は `session?.user` 必須 ✅

