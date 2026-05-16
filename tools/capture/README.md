# 画面キャプチャツール

Claudeが現在のデザインを把握して改善提案を行いやすくするため、ローカルで実行中のアプリの画面キャプチャを自動取得するツールです。

## 📋 機能

- `targeturl.md` に記載されたURLの画面キャプチャを自動取得
- デスクトップ（1920x1080）とモバイル（375x812, iPhone X相当）の両方をキャプチャ
- タイムスタンプ付きディレクトリに整理して保存
- フルページスクリーンショット対応

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

Puppeteerが自動的にChromiumをダウンロードします。

### 2. 開発サーバーの起動

別のターミナルウィンドウで開発サーバーを起動してください。

```bash
npm run dev
```

デフォルトでは `http://localhost:3000` で起動します。

## 📸 使い方

### 基本的な使い方

```bash
# Node.jsで直接実行
node tools/capture/capture.js

# または npm scripts経由（package.jsonに追加した場合）
npm run capture
```

### キャプチャ対象URLの設定

`tools/capture/targeturl.md` を編集して、キャプチャしたいページのURLを追加してください。

```markdown
# キャプチャ対象URL

## ページリスト

- http://localhost:3000/
- http://localhost:3000/manhole/293
- http://localhost:3000/visits
- http://localhost:3000/popular
```

**記法:**
- マークダウンリスト形式（`-` または `*` で開始）
- `http://` または `https://` で始まるURL
- `#` で始まる行はコメントとして無視されます

## 📁 出力

キャプチャされた画像は以下の形式で保存されます：

```
tools/capture/output/
└── 2026-05-17_15-30-45/          # タイムスタンプ付きディレクトリ
    ├── home-desktop.png           # トップページ（デスクトップ）
    ├── home-mobile.png            # トップページ（モバイル）
    ├── manhole-293-desktop.png    # マンホール詳細ページ（デスクトップ）
    ├── manhole-293-mobile.png     # マンホール詳細ページ（モバイル）
    ├── visits-desktop.png         # スタンプ帳ページ（デスクトップ）
    └── visits-mobile.png          # スタンプ帳ページ（モバイル）
```

### ファイル名の規則

- URLパス `/` → `home-{viewport}.png`
- URLパス `/manhole/293` → `manhole-293-{viewport}.png`
- URLパス `/visits` → `visits-{viewport}.png`
- `{viewport}` は `desktop` または `mobile`

## ⚙️ 設定

`capture.js` 内の `CONFIG` オブジェクトで設定を変更できます。

```javascript
const CONFIG = {
  targetUrlFile: path.join(__dirname, 'targeturl.md'),
  outputDir: path.join(__dirname, 'output'),
  viewports: {
    desktop: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    mobile: { width: 375, height: 812, deviceScaleFactor: 2 }, // iPhone X
  },
  timeout: 30000, // 30秒
  waitForSelector: 'body',
};
```

### カスタマイズ例

**iPad Proサイズを追加:**

```javascript
viewports: {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  mobile: { width: 375, height: 812, deviceScaleFactor: 2 },
}
```

**タイムアウトを延長:**

```javascript
timeout: 60000, // 60秒
```

## 🛠️ トラブルシューティング

### エラー: `Cannot find module 'puppeteer'`

```bash
npm install
```

### エラー: `net::ERR_CONNECTION_REFUSED`

開発サーバーが起動していることを確認してください。

```bash
npm run dev
```

### エラー: `TimeoutError: Waiting for selector 'body' failed`

- ページの読み込みに時間がかかっている可能性があります
- `CONFIG.timeout` を増やしてみてください
- ネットワーク接続を確認してください

### 画面が真っ白

- JavaScriptエラーが発生している可能性があります
- ブラウザのコンソールでエラーを確認してください
- `waitForSelector` を変更して、特定の要素が表示されるまで待つようにしてください

## 💡 活用例

### 1. デザインレビュー用

Claudeに画面キャプチャを共有して、デザイン改善のフィードバックを受ける。

```bash
node tools/capture/capture.js
# 生成された画像をClaudeに共有
```

### 2. 変更前後の比較

機能追加やデザイン変更前にキャプチャを取得し、変更後と比較。

```bash
# 変更前
node tools/capture/capture.js
# → output/2026-05-17_10-00-00/

# 変更を加える
# ...

# 変更後
node tools/capture/capture.js
# → output/2026-05-17_14-30-00/

# ディレクトリ間で画像を比較
```

### 3. ドキュメント用スクリーンショット

READMEやドキュメント用のスクリーンショットを一括生成。

### 4. CI/CDでのビジュアルリグレッションテスト

GitHub Actionsなどで定期的にキャプチャを取得し、意図しないデザイン変更を検出。

## 🔧 npm scriptsへの追加（オプション）

`package.json` に以下を追加すると、`npm run capture` で実行できます。

```json
{
  "scripts": {
    "capture": "node tools/capture/capture.js"
  }
}
```

## 📚 技術スタック

- **Puppeteer**: ヘッドレスChrome/Chromiumの自動化
- **Node.js**: スクリプト実行環境
- **Markdown**: URL設定ファイルのフォーマット

## 🤝 貢献

新しい機能やバグ修正の提案は、GitHubのIssueまたはPull Requestでお願いします。

---

## 📖 関連ドキュメント

- [Puppeteer Documentation](https://pptr.dev/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [他のツールについて](../README.md)
