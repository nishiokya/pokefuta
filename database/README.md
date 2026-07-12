# データベースマイグレーション

Supabase SQL Editorで `database/migrations/` のSQLを番号順に実行します。

## 実行順

1. `003_add_social_features.sql`
2. `004_add_site_stats.sql`
3. `005_add_prefecture_badge_system.sql`
4. `006_extend_manhole_fields.sql`
5. `006_fix_orphan_visits.sql`
6. `007_backfill_app_user_from_auth_users.sql`
7. `008_extend_site_stats.sql`
8. `010_add_manhole_share_metadata.sql`
9. `011_add_public_user_info_fn.sql`
10. `012_drop_email_from_app_user.sql`
11. `013_add_app_user_self_select_policy.sql`
12. `014_add_get_my_app_user_id_fn.sql`
13. `015_add_photo_context_images.sql`
14. `016_remove_context_image_file_size_constraint.sql`
15. `017_add_context_image_ml_metadata.sql`
16. `018_add_design_manhole.sql`
17. `019_design_manhole_rls_policies.sql`
18. `020_expose_app_user_public_id.sql`
19. `021_restrict_app_user_public_id.sql`
20. `022_upsert_app_user_fn.sql`
21. `023_add_public_display_names_fn.sql`

## 注意

- 本番反映前にバックアップを取得してください。
- `006_` が2本あります。ファイル名の目的に沿って、上の順で実行してください。
- 新しいマイグレーションを追加したら、この一覧も更新してください。

## app_user テーブルの ID について

`app_user` テーブルには **2種類の ID** があります。混同するとバグになります。

| フィールド | 値 | 用途 |
|---|---|---|
| `app_user.id` | 内部UUID（PK） | プロフィールURL `/users/{id}/prefectures` |
| `app_user.auth_uid` | Supabase auth UID | 認証・RLS・`visit.user_id` との照合 |

- `visit.user_id` は `auth.users.id` = `app_user.auth_uid` を参照（`app_user.id` ではない）
- `app_user` を auth UID で検索するとき: `.eq('auth_uid', user.id)` ✅
- `.eq('id', user.id)` は**必ず失敗する**（`user.id` は auth UID であり内部 PK ではない）❌

### app_user の遅延作成

`app_user` レコードはサインアップ時に作成されません。初回の書き込み操作（`/api/image-upload`, `/api/visits/[id]/like`, `/api/visits/[id]/bookmark`）のタイミングで `ensureAppUser()` が自動作成します。

そのため `auth.users` の件数 > `app_user` の件数 になることが正常です。

### display_name の公開表示

`display_name` は公開フィードやコメントに出す公開プロフィール情報です。
公開表示で `app_user` を直接 SELECT してはいけません。`get_public_display_names()` を使い、呼び出し元が既に持っている auth UID だけを解決します。
