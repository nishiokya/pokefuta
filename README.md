# 🗾 ポケふた訪問記録

ポケモンマンホール（ポケふた）の訪問記録と写真を管理するPWAアプリケーション

## 🌐 アプリケーション

**📱 本番環境**: [https://pokefuta.com](https://pokefuta.com)

**📚 API ドキュメント**: http://localhost:3000/api-docs (開発環境のみ)

## 📱 概要

家族や個人の「訪問したポケモンマンホール」の写真・訪問記録を、スマホからサクッと登録・閲覧・共有できる仕組みです。

既存のポケふた位置データと連携し、地図上での可視化・重複防止・未訪問の発見を支援します。

## ✨ 主な機能

### 現在の機能
- 📧 **Emailログイン** - Supabase Auth（パスワードレス）
- 📸 **写真アップロード** - 自動位置/日時抽出（EXIF）
- 🎯 **マンホール自動マッチング** - GPS位置情報から近くのポケふた候補を提示
- 🗺️ **地図表示** - 訪問済/未訪問を色分け、都道府県別フィルタ
- 🔍 **検索/フィルタ** - 県・市・ポケモン別
- 📊 **訪問統計** - 訪問数、都道府県達成数
- 🔗 **共有リンク** - 訪問記録を共有（署名URL）
- 📖 **API ドキュメント** - Swagger/OpenAPI 自動生成

### 将来機能
- 📱 LINE OAuth + Bot通知
- 🏆 バッジ/統計（県/市達成、年間訪問数）
- 👨‍👩‍👧‍👦 家族グループ共有
- 🔄 公式データの自動クロール更新

## 🏗️ 技術スタック

### フロントエンド
- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS (RPG Pixel風デザイン)
- **Maps**: Leaflet + React Leaflet
- **PWA**: next-pwa (オフライン対応)
- **UI**: Lucide React (アイコン)

### バックエンド
- **Auth**: Supabase Auth (パスワードレス認証)
- **Database**: Supabase PostgreSQL + PostGIS (地理拡張)
- **Storage**: Cloudflare R2 (S3互換)
- **API**: Next.js API Routes
- **API Documentation**: Swagger/OpenAPI

### インフラ
- **Hosting**: AWS Amplify Hosting
- **CDN**: Cloudflare
- **CI/CD**: GitHub → AWS Amplify (自動デプロイ)

### セキュリティ
- **RLS**: Row Level Security で自分のデータのみアクセス
- **署名URL**: 期限付きファイルアクセス
- **環境変数**: AWS Amplify Secrets

## 📊 データベース設計

```sql
-- ユーザー（Supabase Auth拡張）
app_user (id, auth_uid, display_name, avatar_url, stats...)

-- ポケふたマスタ（公式データ）
manhole (id, title, prefecture, municipality, location:GEOGRAPHY, pokemons...)

-- 訪問記録（user_id → auth.users.id を直接参照）
visit (id, user_id, manhole_id, shot_location:GEOGRAPHY, shot_at, note...)

-- 写真（Cloudflare R2）
photo (id, visit_id, manhole_id, storage_key, exif, thumbnails...)

-- 共有リンク
shared_link (id, visit_id, token, expires_at...)
```

### RLS ポリシー

- **app_user**: 自分のプロフィールのみ読み書き可能
- **manhole**: 全員が閲覧可能（公開データ）
- **visit**: 自分の訪問記録のみ読み書き可能
- **photo**: 全員が閲覧可能、作成・更新・削除は自分のvisit経由のみ

## 🚀 セットアップ

### 前提条件

- Node.js 18+
- npm または yarn
- Supabaseプロジェクト
- Cloudflare R2アカウント（オプション）

### インストール

1. **リポジトリのクローン**:
```bash
git clone https://github.com/nishiokya/pokefuta.git
cd pokefuta
```

2. **依存関係のインストール**:
```bash
npm install
```

3. **環境変数の設定**:
```bash
cp .env.example .env.local
```

`.env.local`を編集：
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Cloudflare R2
R2_ACCESS_KEY_ID=xxxxx
R2_SECRET_ACCESS_KEY=xxxxx
R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
R2_BUCKET=pokefuta-photos

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT=36.0
NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG=138.0
NEXT_PUBLIC_MAP_DEFAULT_ZOOM=10
```

4. **Supabaseの設定**:

   Supabase SQL Editorで `database/migrations/` のSQLを番号順に実行します。
   詳細は `database/README.md` を参照してください。

5. **開発サーバーの起動**:
```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

## 📸 写真処理・ストレージ

### Cloudflare R2 (推奨)

1. **アップロード**: ドラッグ&ドロップ or カメラ
2. **EXIF解析**: 位置情報・撮影日時・カメラ情報抽出
3. **重複検出**: SHA-256ハッシュ比較
4. **サムネイル生成**: 320px/800px/1600px (自動)
5. **ストレージ保存**: Cloudflare R2 (S3互換)

### R2設定方法

1. **Cloudflare R2バケットの作成**
   - [Cloudflareダッシュボード](https://dash.cloudflare.com/) → R2
   - バケット名: `pokefuta-photos`

2. **API Tokenの作成**
   - R2 Token API で Access Key ID と Secret Access Key を生成
   - 権限: `Object Read/Write`

3. **環境変数の設定**
   ```bash
   R2_ACCESS_KEY_ID=your_access_key_id
   R2_SECRET_ACCESS_KEY=your_secret_access_key
   R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
   R2_BUCKET=pokefuta-photos
   ```

## 📊 Google Analytics 4 設定

アプリの利用分析とユーザー行動追跡を行います。

### セットアップ手順

1. **Google Analytics 4 プロパティの作成**
   - [Google Analytics](https://analytics.google.com) にアクセス
   - 新しいプロパティを作成（ウェブサイト）
   - 測定 ID を取得（形式: `G-XXXXXXXXXX`）

2. **環境変数の設定**
   ```bash
   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
   ```

3. **AWS Amplify での設定**
   - Amplify Console → App settings → Environment variables
   - `NEXT_PUBLIC_GA_ID` に測定 ID を設定

### 計測内容

- ページビュー（各ページで `trackView(...)` を呼ぶか、共通のルート監視で送信。重複なし）
- ユーザー認証イベント（サインアップ/ログイン）
- ファイルアップロード完了/エラー
- 検索・フィルタリング操作
- エラー追跡（エラーコード・種別のみ、メッセージなど詳細情報は非送信）

### 実装された計測ポイント

| 画面/機能 | イベント | 送信内容 |
|---------|---------|--------|
| ページ遷移 | `page_view` | ページパス・タイトル・タイプ |
| サインアップ | `sign_up` | ユーザーID |
| ログイン | `sign_in` | ユーザーID |
| ファイルアップロード | `upload_start` / `file_upload` / `upload_error` | ファイルサイズ・タイプ・処理時間・エラーコード |
| マンホール検索 | `search` | 検索クエリ・結果件数 |
| フィルタリング | `filter_apply` | フィルタ種別・条件・結果件数 |
| API/認証エラー | `error_event` / `auth_error` / `app_error` | エラーコード・種別（メッセージなし） |

⚠️ **注意**: ページビューは `send_page_view: false` のため、自動送信ではなく各ページ側で明示的に `trackView(...)` を呼び出すか、ルーター変更を監視して送信する必要があります。

**プライバシーポリシー**:
- ユーザーメールアドレスなどの PII は送信しない
- 緯度/経度などの位置情報は送信しない
- エラーメッセージなど機微情報は一切送信しない

### 署名付きURL

写真アクセスは署名付きURL（5分間有効）で提供されます：
- セキュア: R2へのダイレクトアクセスを防止
- キャッシュ: ブラウザキャッシュで高速表示
- 期限付き: URLの再利用を防止

## 🗺️ マップ機能

- **ベースレイヤ**: OpenStreetMap
- **マーカー**: 訪問済み（✓ 緑）/ 未訪問（? 赤）
- **フィルタ**: 都道府県別表示
- **ユーザー位置**: リアルタイム表示
- **ポップアップ**: マンホール詳細・ポケモン情報

## 📖 API ドキュメント

### Swagger/OpenAPI

本番環境: **開発環境のみ有効**（本番では403エラー）

- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI JSON**: http://localhost:3000/api/swagger

### 新規API作成時のルール

1. **すべてのAPI Routeファイルに`@swagger`コメントを追加**
2. **認証が必要な場合は`security: - cookieAuth: []`を追加**
3. **Swagger UIで表示を確認**

## 🔒 セキュリティ

### Row Level Security (RLS)

すべてのテーブルでRLSが有効化されています：

```sql
-- visitテーブル: 自分のデータのみアクセス可能
CREATE POLICY "users_select_own_visits"
ON visit FOR SELECT
USING (auth.uid() = user_id);
```

### 認証チェック

すべてのAPI Routeで認証チェックを実装：

```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}
```

### 環境変数の保護

- **ローカル**: `.env.local`（`.gitignore`に含める）
- **AWS Amplify**: 環境変数設定（暗号化）

## 🚀 デプロイ

### AWS Amplify Hosting

1. **GitHubリポジトリと連携**
   - AWS Amplify Console → New App → GitHub
   - リポジトリ: `nishiokya/pokefuta`
   - ブランチ: `main`

2. **ビルド設定**
   - `amplify.yml`を使用（自動検出）
   - Node.js 18+

3. **環境変数の設定**
   - Amplify Console → App Settings → Environment variables
   - 上記の環境変数をすべて設定

4. **デプロイ**
   - `git push origin main` → 自動デプロイ
   - ビルド時間: 約5-10分

詳細は `DEPLOYMENT.md` を参照。

## 🧪 テスト

```bash
# 型チェック
npm run type-check

# Lint
npm run lint

# ビルドテスト
npm run build
```

## 📊 コスト見積もり

- **AWS Amplify**: $0-15/月（ビルド時間・転送量による）
- **Supabase**: $0-25/月（Free→Pro）
- **Cloudflare R2**: $0-5/月（ストレージ・転送量による）
- **ドメイン**: ¥1,000/年
- **合計**: ¥1,000-5,000/月程度

## 📱 PWA機能

- **オフライン対応**: Service Worker + Cache API
- **カメラアクセス**: ネイティブカメラ起動
- **位置情報**: GPS/EXIF座標取得
- **ホーム画面に追加**: iOS/Android対応
- **プッシュ通知**: 将来実装予定

## 🎨 デザイン

**RPG Pixel風デザイン**
- フォント: M PLUS Rounded 1c
- カラースキーム: レトロゲーム風
- アニメーション: ピクセルアート風

## 📄 ドキュメント

- **README.md**: 開発の入口
- **database/README.md**: DBマイグレーションの実行方法
- **tools/README.md**: 管理ツールの使い方
- **DEPLOYMENT.md**: AWS Amplifyデプロイ手順
- **CLOUDFLARE_R2_SETUP.md**: R2ストレージ設定
- **.env.example**: 環境変数のサンプル

## 🛠️ 主要なページ

- `/` - ホーム（訪問記録一覧・最近の写真）
- `/map` - 地図表示（マンホール位置・訪問状況）
- `/nearby` - 近くのポケふた検索
- `/upload` - 写真アップロード
- `/visits` - 訪問履歴
- `/manhole/[id]` - マンホール詳細
- `/api-docs` - Swagger UI（開発環境のみ）

## 📄 ライセンス

MIT License

## 👥 貢献

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## 🐛 バグ報告・機能要求

GitHub Issuesをご利用ください: [https://github.com/nishiokya/pokefuta/issues](https://github.com/nishiokya/pokefuta/issues)

## 🙏 謝辞

- ポケモン公式「ポケふた」プロジェクト
- OpenStreetMap Contributors
- Supabase
- Cloudflare R2
- AWS Amplify

---

🤖 **Generated with [Claude Code](https://claude.ai/claude-code)**
