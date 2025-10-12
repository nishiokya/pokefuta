# AWS Amplify Hosting デプロイ手順

このドキュメントは、pokefutaアプリをAWS Amplify Hostingにデプロイする手順を説明します。

## 前提条件

- GitHubリポジトリ: https://github.com/nishiokya/pokefuta
- AWSアカウント
- Supabaseプロジェクト（RLS有効化済み）
- Cloudflare R2バケット

## 📋 デプロイ手順

### 1. AWS Amplify コンソールでアプリを作成

1. [AWS Amplify Console](https://console.aws.amazon.com/amplify/)にアクセス
2. 「新しいアプリ」→「ホスティング」を選択
3. GitHubを接続
4. リポジトリ: `nishiokya/pokefuta` を選択
5. ブランチ: `main` を選択

### 2. ビルド設定

1. アプリ設定で `amplify.yml` が自動検出されることを確認
2. ビルド設定をレビュー（通常は変更不要）
3. Node.jsバージョン: 18以上を推奨

### 3. 環境変数の設定

**Amplify Console > App Settings > Environment variables** で以下を設定：

#### 必須環境変数

```bash
# Supabase（公開可能）
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...（Anon Keyを貼り付け）

# Supabase（サーバーサイドのみ）⚠️
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...（Service Role Keyを貼り付け）

# Cloudflare R2（サーバーサイドのみ）⚠️
# 注: 画像はsigned URLで配信されるため、公開URLは不要
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
R2_BUCKET=your_bucket_name

# アプリURL（公開可能）
NEXT_PUBLIC_APP_URL=https://your-app-name.amplifyapp.com

# マップデフォルト位置（公開可能）
NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT=36.0
NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG=138.0

# Node環境
NODE_ENV=production
```

#### 環境変数設定のポイント

- ✅ `NEXT_PUBLIC_*` で始まる変数は公開されます（ブラウザで見えます）
- ⚠️ `NEXT_PUBLIC_` なしの変数はサーバーサイドのみで使用されます
- 🔒 Service Role KeyとR2の認証情報は絶対に `NEXT_PUBLIC_` を付けないこと

### 4. デプロイの実行

1. 「保存してデプロイ」をクリック
2. ビルドログを確認（約5-10分）
3. デプロイ完了後、URLが発行されます

### 5. デプロイ後の確認

#### ✅ 必須チェック項目

- [ ] トップページが正常に表示される
- [ ] ログイン/サインアップが動作する
- [ ] マップが表示される
- [ ] 近くのマンホール検索が動作する
- [ ] 画像アップロードが動作する
- [ ] 訪問履歴が表示される
- [ ] RLSが有効（他のユーザーのデータが見えない）

#### 🔍 トラブルシューティング

##### ビルドエラーが発生する場合

```bash
# ローカルでビルドテスト
npm run build

# エラーがある場合は修正してpush
git add .
git commit -m "Fix build errors"
git push origin main
```

##### 環境変数が読み込まれない場合

1. Amplify Console > App Settings > Environment variables を確認
2. 変数名のスペルミスがないか確認
3. 再デプロイ: Amplify Console > デプロイ > 再デプロイ

##### 画像が表示されない場合

1. R2の公開URLが正しいか確認
2. CORSが設定されているか確認（R2側）
3. `next.config.js` の `remotePatterns` を確認

##### Supabaseに接続できない場合

1. Supabase URLとAnon Keyが正しいか確認
2. RLSポリシーが有効化されているか確認
3. SupabaseのAPI URLが公開アクセス可能か確認

## 🔧 カスタムドメインの設定（オプション）

### 1. ドメインの追加

1. Amplify Console > App Settings > Domain management
2. 「ドメインの追加」をクリック
3. 独自ドメインを入力（例: pokefuta.com）
4. DNSレコードを設定

### 2. HTTPS証明書

- Amplifyが自動でACM証明書を発行
- 通常5-10分で有効化

### 3. 環境変数の更新

カスタムドメイン設定後、以下を更新：

```bash
NEXT_PUBLIC_APP_URL=https://your-custom-domain.com
```

## 📊 モニタリングとログ

### ビルドログ

Amplify Console > Deployments > ビルド番号をクリック

### アプリケーションログ

CloudWatch Logs で確認:
- `/aws/amplify/[app-id]/[environment]/build`
- `/aws/amplify/[app-id]/[environment]/runtime`

### エラー追跡

- Amplify Console > Monitoring でエラー率を確認
- CloudWatch Alarms を設定して通知

## 🚀 CI/CD パイプライン

### 自動デプロイ

- `main` ブランチへのpushで自動デプロイ
- Pull Requestでプレビュー環境を自動作成（オプション）

### デプロイフック

Amplify Console > Build settings > Build hooks で設定可能

## 💰 コスト最適化

### 推奨設定

1. **キャッシュの活用**: `amplify.yml` でキャッシュを有効化済み
2. **画像最適化**: Next.js Image コンポーネントを使用
3. **ビルド時間短縮**: 不要なdependenciesを削除

### 無料枠

- ビルド時間: 月1000分まで無料
- データ転送: 月15GBまで無料
- ホスティング: 無制限

## 🔒 セキュリティベストプラクティス

### 実装済み

- ✅ RLS（Row Level Security）有効化
- ✅ 環境変数の適切な管理
- ✅ セキュリティヘッダー設定
- ✅ HTTPS強制

### 推奨追加対応

- [ ] Rate Limiting（Upstash Redis推奨）
- [ ] WAF設定（AWS WAF）
- [ ] 定期的な依存関係の更新

## 📚 参考リンク

- [AWS Amplify Docs](https://docs.amplify.aws/)
- [Next.js on Amplify](https://docs.amplify.aws/guides/hosting/nextjs/)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)

## ✅ デプロイ完了後のチェックリスト

- [ ] 本番URLでアプリが正常動作
- [ ] 環境変数がすべて設定済み
- [ ] RLSが有効（他ユーザーデータ非表示）
- [ ] 画像アップロードが動作
- [ ] カスタムドメイン設定（オプション）
- [ ] モニタリング設定
- [ ] バックアップ戦略の確認
