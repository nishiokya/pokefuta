# manhole_comment（マンホール共有コメント）実装 PR 指示書

このファイルは「マンホール情報の共有用コメント（`manhole_comment`）」を有効化するための**別PR**の実装指示書です。

## 目的（ゴール）
- マンホール詳細ページで、訪問（visit）に紐づかない**マンホール共通コメント**を表示・投稿できるようにする。
- 読み取りは全員（未ログイン含む）に公開、投稿はログイン必須。
- 既存の `visit_comment`（訪問コメント）UIはこのPRでは触らない（本PRでUI非表示済み）。

## 前提
- DBに `manhole_comment` テーブルが存在すること。
  - 現状、コード上の型定義 [src/types/database.ts](src/types/database.ts) には `manhole_comment` がありません。
  - ただし設計書にはDDLが記載されています（例: [database/COMMENT_REACTION_DESIGN.md](database/COMMENT_REACTION_DESIGN.md)、[CLAUDE.md](CLAUDE.md)）。

## DB（Supabase）作業
- Supabase SQL Editor で以下を確認/適用:
  - `manhole_comment` テーブル作成（未作成の場合）
  - RLS有効化 + ポリシー

推奨ポリシー（設計書準拠）:
- SELECT: 全員閲覧可能 `USING (true)`
- INSERT: 認証済みユーザーのみ & `user_id = auth.uid()`
- UPDATE/DELETE: 自分のコメントのみ

注意:
- `user_id` は `auth.users(id)`（UUID）を参照する想定。

## 実装範囲（コード）

### 1) API 追加
- 新規: `GET/POST /api/manholes/[id]/comments`
  - パス: `src/app/api/manholes/[id]/comments/route.ts`

GET 要件:
- 入力: `manhole_id`（path param）
- 出力: コメント一覧（新しい順 or 古い順は要件確定。まずは古い順でOK）
- ページング: `limit` / `offset` を query で受ける（visitコメントAPIと同じ形）
- 表示名: `app_user` を用いて `display_name/email` を付与（`visit_comment` API のやり方を踏襲）

POST 要件:
- 認証必須（cookie session）
- 入力: `content`（最大1000文字）
- 保存: `manhole_comment` に insert（`manhole_id`, `user_id`, `content`）
- レスポンス: 追加したコメント（`user` を付与して返すとUIが楽）

### 2) UI 追加
- マンホール詳細ページ: `src/app/manhole/[id]/page.tsx`

UI要件（最小）:
- 「コメント」セクションを追加
  - コメント一覧（読み取りは未ログインでも見える）
  - コメント投稿フォーム（ログイン時のみ表示）

コンポーネント設計（推奨）:
- 既存の [src/components/CommentModal.tsx](src/components/CommentModal.tsx) は `visitId` 前提なので、以下のどちらかにする:
  1. 新規 `ManholeCommentModal` を作る（推奨: 影響範囲が小さい）
     - `src/components/ManholeCommentModal.tsx`
     - fetch先は `/api/manholes/${manholeId}/comments`
  2. `CommentModal` を汎用化（`resourceType: 'visit'|'manhole'` + `resourceId`）
     - 影響が大きいので、レビュー負荷が上がる

### 3) 型定義更新
- [src/types/database.ts](src/types/database.ts) に `manhole_comment` テーブル定義を追加
  - `Row/Insert/Update` を追加
  - `parent_comment_id` は今回の最小実装では使わなくてよい（NULL固定でもOK）

## 受け入れ条件（Acceptance Criteria）
- 未ログイン:
  - マンホール詳細ページでコメント一覧が見える
  - 投稿UIは表示されない（またはクリックでログイン誘導）
- ログイン:
  - コメント投稿が成功し、即時に一覧へ反映される
- セキュリティ:
  - RLSにより、他人のコメント編集・削除ができない

## 非ゴール（この別PRではやらない）
- 返信（スレッド）
- 編集/削除UI
- スパム対策（レート制限/通報）
- visit_comment の再表示/統合

## テスト/確認
- `npm run -s type-check`
- ブラウザで動作確認:
  - 未ログインで詳細ページ表示
  - ログイン後に投稿

---

## このPR（現在のPR）との差分メモ
- `visit_comment` のUI導線は現在のPRで非表示化済み。
- 既存の `visit_comment` API は残している（将来の再有効化に備える）。
