# R2設定手順

## 1. Cloudflare R2での設定

### バケット作成
1. Cloudflareダッシュボードにログイン
2. R2 Object Storageサービスに移動
3. 新しいバケットを作成: `pokefuta-photos`

### API Token作成
1. `My Profile` → `API Tokens` に移動
2. `Create Token` をクリック
3. Custom token を選択
4. 権限設定:
   - Zone:Zone:Read (if needed)
   - Account:Cloudflare R2:Edit
5. Account Resources: 所有するアカウントを選択
6. Zone Resources: 全てのゾーン (if applicable)

### R2 API Token作成
1. R2 → `Manage R2 API tokens` に移動
2. `Create API token` をクリック
3. 権限: `Admin Read & Write` または `Object Read & Write`
4. TTL: 必要に応じて設定
5. Access Key ID と Secret Access Key をコピー

## 2. 環境変数設定

### ローカル開発 (.env.local)
```bash
# ストレージプロバイダー
STORAGE_PROVIDER=r2

# Cloudflare R2設定
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_ENDPOINT=https://509ce5c2ad8789cb0c6b20908ab44404.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://509ce5c2ad8789cb0c6b20908ab44404.r2.cloudflarestorage.com
R2_BUCKET=pokefuta-photos

# データベース (Supabase)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Vercel Deploy
Vercelダッシュボードの Settings → Environment Variables で以下を設定:

- `STORAGE_PROVIDER`: `r2`
- `R2_ACCESS_KEY_ID`: アクセスキーID
- `R2_SECRET_ACCESS_KEY`: シークレットアクセスキー  
- `R2_ENDPOINT`: `https://509ce5c2ad8789cb0c6b20908ab44404.r2.cloudflarestorage.com`
- `R2_PUBLIC_URL`: `https://509ce5c2ad8789cb0c6b20908ab44404.r2.cloudflarestorage.com`
- `R2_BUCKET`: `image`

## 3. テスト方法

### アップロードテスト
```bash
# 開発サーバー起動
npm run dev

# ブラウザで http://localhost:3000/upload にアクセス
# 画像ファイルをドラッグ&ドロップしてアップロードテスト
```

### APIテスト
```bash
# cURLでテスト
curl -X POST http://localhost:3000/api/minimal-upload \
  -F "file=@test-image.jpg" \
  -H "Content-Type: multipart/form-data"
```

## 4. トラブルシューティング

### よくあるエラー
1. **Authentication Error**: アクセスキーとシークレットキーを確認
2. **Bucket Not Found**: バケット名とエンドポイントURLを確認
3. **Permission Denied**: API Tokenの権限設定を確認

### ログ確認
```bash
# 開発サーバーのコンソールでエラーログを確認
# ブラウザの開発者ツールでネットワークエラーを確認
```

## 5. コスト最適化

### R2のコスト構造
- ストレージ: $0.015/GB/月
- Class A操作 (PUT/POST): $4.50/百万リクエスト
- Class B操作 (GET): $0.36/百万リクエスト
- 無料枠: 10GB/月、100万Class A、1000万Class B

### 最適化のヒント
1. 画像圧縮でファイルサイズを削減
2. CDNキャッシュを活用
3. 不要な画像の定期削除