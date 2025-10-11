# 🎮 ポケふた RPGピクセルデザイン 実装ガイド

## 📚 ドキュメント構成

1. **`design_css.md`** - 完全なCSS仕様書とコンポーネント設計
2. **`DESIGN_SPEC.md`** - 元のデザイン仕様（参考資料）
3. このファイル - クイックスタートガイド

---

## 🚀 クイックスタート

### RPGスタイルを使う

既存のPokemonスタイル（`.card-pokemon`, `.btn-pokemon`）に加えて、新しいRPGスタイルが利用可能です:

```jsx
// RPGウィンドウ
<div className="rpg-window">
  <h2 className="rpg-window-title">クエストボード</h2>
  <p className="font-pixelJp">新しい冒険が待っている！</p>
</div>

// RPGボタン
<button className="rpg-button rpg-button-primary">
  クエスト開始
</button>

// ステータス表示
<div className="rpg-status">
  <div className="rpg-stat-item">
    <div className="rpg-stat-value">12</div>
    <div className="rpg-stat-label">訪問済み</div>
  </div>
</div>
```

---

## 🎨 利用可能なコンポーネント

### 基本要素

| クラス名 | 用途 | 例 |
|---------|------|---|
| `.rpg-window` | メインコンテナ | カード、ダイアログ |
| `.rpg-window-title` | タイトルバー | ゴールド文字+影 |
| `.rpg-button` | 基本ボタン | 青色、8bit風 |
| `.rpg-button-primary` | 主要アクション | 赤色 |
| `.rpg-button-success` | 成功・完了 | 緑色 |

### データ表示

| クラス名 | 用途 |
|---------|------|
| `.rpg-status` | 統計グリッド（3列） |
| `.rpg-stat-item` | 個別の統計 |
| `.rpg-stat-value` | 大きな数字（ピクセルフォント） |
| `.rpg-stat-label` | ラベル |

### プログレスバー

| クラス名 | 用途 |
|---------|------|
| `.rpg-hp-bar` | コンテナ |
| `.rpg-hp-fill` | 緑色のバー（パルスアニメーション） |

### アニメーション

| クラス名 | 効果 |
|---------|------|
| `.rpg-popup-damage` | ダメージ数値が上に飛ぶ |
| `.rpg-cursor` | 点滅する矢印カーソル |
| `.rpg-levelup-flash` | レベルアップ時のフラッシュ |
| `.rpg-selected` | 選択中の点滅枠 |
| `.rpg-loading` | ドット3つのローディング |
| `.rpg-shake` | エラー時の振動 |
| `.rpg-coin-spin` | コイン回転 |

---

## 🖌️ カラーパレット（Tailwind）

```jsx
// 背景
className="bg-rpg-bgPaper"   // 羊皮紙風
className="bg-rpg-bgDark"    // ダークBG
className="bg-rpg-bgLight"   // ライトBG

// テキスト
className="text-rpg-textDark"  // メインテキスト
className="text-rpg-textGold"  // ゴールド

// アクセント
className="bg-rpg-red"      // HP、重要
className="bg-rpg-blue"     // MP、情報
className="bg-rpg-yellow"   // ゴールド、報酬
className="bg-rpg-green"    // 回復、成功
className="bg-rpg-purple"   // 特殊、レア

// ボーダー
className="border-rpg-border"
```

---

## 📐 スペーシング（8pxグリッド）

```jsx
className="p-rpg-1"  // 8px
className="p-rpg-2"  // 16px
className="p-rpg-3"  // 24px
className="p-rpg-4"  // 32px
className="p-rpg-5"  // 40px
className="p-rpg-6"  // 48px
className="p-rpg-8"  // 64px

// 同様に margin も使用可能
className="m-rpg-2 mt-rpg-4"
```

---

## 🔤 フォント

```jsx
// ピクセルフォント（英数字）
className="font-pixel"

// ピクセルフォント（日本語対応）
className="font-pixelJp"

// 使い分け
<h1 className="font-pixel">LEVEL UP!</h1>
<p className="font-pixelJp">レベルアップしました！</p>
```

---

## 💡 使用例

### ホーム画面の統計カード

```jsx
<div className="rpg-window">
  <h2 className="rpg-window-title">🎮 冒険の記録</h2>

  <div className="rpg-status">
    <div className="rpg-stat-item">
      <div className="rpg-stat-value">12</div>
      <div className="rpg-stat-label">訪問済み</div>
    </div>
    <div className="rpg-stat-item">
      <div className="rpg-stat-value">245</div>
      <div className="rpg-stat-label">総マンホール</div>
    </div>
    <div className="rpg-stat-item">
      <div className="rpg-stat-value">35</div>
      <div className="rpg-stat-label">写真</div>
    </div>
  </div>

  <button className="rpg-button rpg-button-primary w-full mt-rpg-3">
    📷 新しいクエスト
  </button>
</div>
```

### アップロード進捗バー

```jsx
<div className="rpg-window">
  <h3 className="font-pixelJp text-rpg-textDark mb-rpg-2">
    アップロード中<span className="rpg-loading"></span>
  </h3>

  <div className="rpg-hp-bar">
    <div
      className="rpg-hp-fill"
      style={{ width: `${progress}%` }}
    />
  </div>

  <p className="font-pixelJp text-sm mt-rpg-1 text-rpg-textDark">
    {progress}% 完了
  </p>
</div>
```

### メニューリスト（カーソル付き）

```jsx
<div className="rpg-window">
  <h2 className="rpg-window-title">メニュー</h2>

  <ul className="space-y-2">
    <li className="rpg-cursor font-pixelJp p-2 hover:bg-rpg-yellow/20 cursor-pointer">
      マップを見る
    </li>
    <li className="font-pixelJp p-2 hover:bg-rpg-yellow/20 cursor-pointer">
      写真を登録
    </li>
    <li className="font-pixelJp p-2 hover:bg-rpg-yellow/20 cursor-pointer">
      訪問履歴
    </li>
  </ul>
</div>
```

### 成功通知（アニメーション）

```jsx
// アップロード成功時
<div className="rpg-window rpg-levelup-flash">
  <p className="font-pixel text-rpg-green text-center">
    SUCCESS!
  </p>
  <p className="font-pixelJp text-center mt-2">
    写真をアップロードしました
  </p>
</div>

// エラー時
<div className="rpg-window rpg-shake">
  <p className="font-pixel text-rpg-red text-center">
    ERROR!
  </p>
  <p className="font-pixelJp text-center mt-2">
    アップロードに失敗しました
  </p>
</div>
```

---

## 🎯 デザイン切り替え

現在、2つのデザインシステムが共存しています:

### Pokemon風（既存）
- グラデーション、丸角、滑らかなアニメーション
- クラス: `.card-pokemon`, `.btn-pokemon` など

### RPG風（新規）
- ピクセルアート、角ばったデザイン、ステップアニメーション
- クラス: `.rpg-window`, `.rpg-button` など

### 混在させる場合

```jsx
// Pokemon風の背景に RPGウィンドウを配置
<div className="card-pokemon p-4">
  <div className="rpg-window">
    <h2 className="rpg-window-title">ハイブリッド！</h2>
  </div>
</div>
```

---

## 📱 レスポンシブ対応

すべてのRPGコンポーネントはモバイルファーストで設計:

- 最小タッチターゲット: 44×44px
- 8pxグリッドシステム
- フォントサイズ: 最小12px（`.text-sm`）
- 画面幅: 最大448px（`.container-pokemon`）

---

## ♿ アクセシビリティ

- ✅ コントラスト比 4.5:1以上（WCAG AA）
- ✅ ピクセルフォントは読みやすいサイズ（16px以上推奨）
- ✅ アニメーションは `prefers-reduced-motion` 対応（要実装）
- ✅ キーボードナビゲーション対応

---

## 🔧 カスタマイズ

### 新しい色を追加

`tailwind.config.js`:
```js
colors: {
  rpg: {
    // ... 既存の色
    orange: '#E67E22', // 新しい色
  }
}
```

使用:
```jsx
<div className="bg-rpg-orange">オレンジBG</div>
```

### 新しいコンポーネント

`src/app/globals.css`:
```css
.rpg-tooltip {
  @apply bg-rpg-bgDark text-white;
  @apply border-4 border-rpg-border;
  @apply p-rpg-2;
  @apply font-pixelJp text-sm;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.5);
}
```

---

## 📚 参考資料

- [Press Start 2P フォント](https://fonts.google.com/specimen/Press+Start+2P)
- [DotGothic16 フォント](https://fonts.google.com/specimen/DotGothic16)
- ピクセルアートチュートリアル: [Lospec](https://lospec.com/pixel-art-tutorials)
- 8bitカラーパレット: [Lospec Palette List](https://lospec.com/palette-list)

---

## 🎮 今後の拡張

- [ ] サウンドエフェクト（8bit音）
- [ ] パーティクルエフェクト（コイン、星など）
- [ ] ダイアログボックス（吹き出し）
- [ ] キャラクターアイコン（ドット絵）
- [ ] バッジシステム（実績解除）
- [ ] アニメーションプリセット拡充

---

更新日: 2025-10-09
作成者: AI Assistant
バージョン: 1.0
