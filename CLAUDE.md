# pokefuta — 作業ルール

## DB操作（本番とローカルの境界）

本番 DB はコードのデプロイと連動していない。**スキーマの適用は独立した手作業**。
つまりコードとスキーマはズレる方向にしか事故らない。

- `supabase/migrations/` にファイルを足した作業は、**本番へ適用するまで完了ではない**
- 適用後は列・トリガ・RLS・CHECK を実際に問い合わせて確認する。push の成功だけを根拠にしない
- `npm run db:drift` でローカルのファイルと本番の適用済み版を照合する。
  未適用と、逆に本番だけにある版（ダッシュボードから直接 DDL を打った痕跡）の両方を検出する
- ダッシュボードから直接 DDL を打ったら、マイグレーションファイルに落として版を合わせる

DDL 後は PostgREST がスキーマを認識しているかも確かめる。新しい列を select して
`PGRST204` が返るならキャッシュが古い（`42501` は権限の話で、認識はできている）。

背景: 2026-08-09、コードだけ先に本番へ出てマイグレーションが未適用のまま放置され、
`design_manhole` への INSERT が存在しない列を指して失敗し続けた。API 層が PostgREST の
エラーを汎用文言に丸めるため、**本番画面からもログからも原因が見えなかった**。
（詳細は `src/lib/design-manhole-submission-status.ts` とコミット `49dfd90`）

## 書き込みの宛先を確認する

書き込み（INSERT / UPDATE / DELETE / アップロード / DDL）の前に、**宛先を表示してから実行する。**

- `.env.local` を `set -a; . ./.env.local` のように丸ごと読み込まない。必要な値だけ取り出す
- **Supabase と R2 は別々に向き先を持つ。** 一方がローカルでも他方がそうとは限らないので、
  書き込みを伴う動作確認の前に両方を確認する
- 本番への書き込み経路はマイグレーションの適用と**アプリ本来の経路**に限る。
  curl + service role の直叩きはしない。Supabase MCP は read-only なので調査に使ってよい
- **検証のために本番への書き込み手段を新設しない。** トリガや制約の確認は、機能を有効にして
  アプリの実操作で通す方が、余計な権限を作らずに同じことを確かめられる

## 資格情報の置き場所

`.env.local` は**ローカルスタック専用**。先頭で `SUPABASE_ENV=local` を宣言する。

- `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` をここに置かない。どちらも本番に届く。
  Supabase CLI は `~/.supabase/access-token` を読むので複製する必要がない
- ローカルの Supabase キーは `iss: supabase-demo` の固定デモキー。本番キーを置かない
- `npm run type-check` に含まれる `tools/check-supabase-target.js` が上記を検査する

## 検査スクリプト

`npm run type-check` に組み込み済み:

| スクリプト | 内容 |
|---|---|
| `tools/check-public-display-name-source.js` | 表示名の参照元 |
| `tools/check-photo-select-star.js` | photo を `select=*` で読んでいないこと |
| `tools/check-ga4-contract.js` | GA4 の計測契約 |
| `tools/check-safe-area-env.js` | CSS `env(safe-area-*)` のスペル |
| `tools/check-supabase-target.js` | `.env.local` への本番資格情報の混入 |

個別に叩くもの:

| スクリプト | 内容 | 前提 |
|---|---|---|
| `npm run db:drift` | マイグレーションのローカル / 本番のズレ | 本番へのリンク。`.github/workflows/db-drift.yml` が PR・main・毎日も回す |
| `npm run verify:design-manhole-trigger` | 近接レビュー強制のトリガと RLS を実際に INSERT して確認 | `supabase start` でローカルスタックが起動 |
| `npm run verify:photo-visibility` | photo の列権限と RLS を実際にロールを切り替えて確認（exif が anon から見えないこと、非公開写真が隠れること、INSERT の RETURNING が権限で落ちないこと） | `supabase start` でローカルスタックが起動 |
| `npm run verify:app-user-visibility` | app_user の列権限と RLS を実際にロールを切り替えて確認（anon が1列も読めないこと、他人の行が見えないこと、プロフィール系 RPC が権限で落ちないこと） | `supabase start` でローカルスタックが起動 |
| `npm run verify:comment-guardrails` | 蓋コメントの制約・レート制限・通報の RLS・公開ID/表示名の条件一致を実際に書き込んで確認 | `supabase start` でローカルスタックが起動 |

**列単位 GRANT のテーブルは `select=*` で読めない。** PostgREST の `*` は全列に展開されるので、
GRANT していない列（`photo.exif` 等）まで要求して **42501** で落ちる。
「権限のある列だけ返す」にはならない。`photo` はこれを `check-photo-select-star.js` で見張っている。
SQL 側の `verify:*` は列権限と RLS が正しいことしか見ないので、**アプリが `*` を投げている退行は捕まらない**。

**プロフィールに列を足すときは、先に `verify:app-user-visibility` へ「anon から読めない」ケースを足す。**
`app_user` はテーブル単位の GRANT を持たない設計にしてあるので、列を足しても自動では公開されない。
逆に言うと、公開したい列は名指しで GRANT しない限り出てこない。

`tests/design-manhole-db-policy.test.ts` はマイグレーションSQLを正規表現で照合するだけで、
トリガを実行しない。**オブジェクトが存在することと実行時に正しく動くことは別物**なので、
DB の挙動を変えたら `verify:design-manhole-trigger` の側も更新する。

## 用語

蓋の呼び方は2層。ナビ・タブ・フッターの**ラベル**は「デザインふた」「キャラふた」、
title / h1 / OGP / 本文の**概念名**は「デザインマンホール」「キャラクターマンホール」。
規約は `src/lib/siteNav.ts` の `NavItem` に再掲してある。

蓋を数える単位は「**枚**」（「件」は使わない）。
