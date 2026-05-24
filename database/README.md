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

## 注意

- 本番反映前にバックアップを取得してください。
- `006_` が2本あります。ファイル名の目的に沿って、上の順で実行してください。
- 新しいマイグレーションを追加したら、この一覧も更新してください。
