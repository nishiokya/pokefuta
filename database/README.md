# データベース

スキーマの正は `supabase/migrations/` です。

- `supabase/migrations/20260718000000_prod_baseline.sql` — 本番スキーマの全量ダンプ（2026-07-18 取得）。「現在のスキーマ」のドキュメントを兼ねる
- `database/migrations/archive/` — ベースラインに焼き込み済みの過去マイグレーション（003〜025）。経緯・意図の記録として保存。**再実行しないこと**

データのバックアップはリポジトリに含まれません。シード（後述）は公開データから再生成できる参照データであり、ユーザーデータ（`auth.users` / `app_user` / `visit` / `photo` / コメント等）は本番にのみ存在します。バックアップは別途計画すること。

## ローカル開発DB（Supabase CLI）

WSL/ローカルでは Supabase CLI のローカルスタック（Docker）を使います。素のPostgresではなくローカルSupabaseを使うのは、スキーマが `auth.users` / `auth.uid()` / RLS に依存しているためです。

```bash
npx supabase start    # 起動（初回はDockerイメージ取得で数分）
npx supabase stop     # 停止（データは保持される）
npx supabase status   # 接続情報の確認
npx supabase db reset # supabase/migrations + supabase/seed を再適用してDBを作り直す
```

| サービス | URL |
|---|---|
| API (アプリが接続する先) | http://127.0.0.1:54321 |
| Studio (管理画面) | http://127.0.0.1:54323 |
| Mailpit (認証メール受信) | http://127.0.0.1:54324 |
| Postgres 直接続 | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` を `npx supabase status` が表示するローカル値に切り替えて `npm run dev` を実行します（クラウド値はコメントで温存してある）。

- メール確認は無効化済み（`supabase/config.toml`）のため、ローカルではメール+パスワードで即サインアップできます。OAuthログインはローカル未設定です。
- 写真ストレージは Cloudflare R2 のままなので、R2 の環境変数は変更不要です。

## スキーマ変更のフロー

CLI はログイン・`link` 済み（本番プロジェクト `kbwzwgsjqvflgfauzcpn`）。マイグレーション履歴はベースラインまで本番と同期済み。

```bash
npx supabase migration new <name>   # supabase/migrations/ に空ファイル生成
# SQLを書く（テーブル・PostGIS関数はスキーマ修飾を推奨）
npx supabase db reset               # ローカルで適用テスト
npx supabase db push                # 本番へ適用
```

SQL Editor への手動コピペ運用は廃止。本番へ直接SQLを流した場合は、ベースラインを取り直して履歴を修復すること:

```bash
npx supabase db dump -f supabase/migrations/<新タイムスタンプ>_prod_baseline.sql
npx supabase migration repair --status applied <新タイムスタンプ>
# 古いベースラインと適用済みマイグレーションは削除し、履歴も repair で整理する
```

CLIトークン（`sbp_`、アカウント単位）は 2026-10-18 頃に失効します。https://supabase.com/dashboard/account/tokens で再発行し `npx supabase login --token <sbp_...>` を実行（控えは `.env.local` の `SUPABASE_ACCESS_TOKEN`）。

## シードデータ

`npx supabase db reset` 時に `supabase/seed/` が順に投入されます:

1. `01_prefecture.sql` — 47都道府県（旧005の初期データと同一）
2. `02_manhole.sql` — 実データ482件。`tools/build-local-seed.sh` で最新の pokefuta.ndjson から再生成できる
3. `03_backfill.sql` — manhole の prefecture_id / region 補完（旧006と同一ロジック）

注意: CLI のシード実行は search_path が空のため、シードSQL内ではテーブル・PostGIS関数を必ずスキーマ修飾する（`public.manhole`, `extensions.ST_GeogFromText`）。

## 型定義との乖離

`src/types/database.ts` には本番に存在しないテーブル（`image`, `shared_link`）や存在しないカラム（`manhole.updated_at`, `photo.storage_provider` 等）が定義されています。本番ダンプが実態です。`npx supabase gen types typescript --local` で実スキーマから自動生成した型への置き換えを検討。

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
