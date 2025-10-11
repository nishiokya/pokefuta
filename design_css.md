# 🎮 ポケふた RPGピクセルデザイン CSS仕様書

## 🎨 コンセプト
レトロRPG風のピクセルアートデザインで、ポケモン初期作品（赤・緑）の雰囲気を再現

---

## 🎯 カラーパレット（RPGスタイル）

### メインカラー
```css
/* RPG Primary Colors */
--rpg-red:         #E74C3C;  /* HP/重要アクション */
--rpg-blue:        #3498DB;  /* MP/情報 */
--rpg-yellow:      #F1C40F;  /* ゴールド/報酬 */
--rpg-green:       #2ECC71;  /* 回復/成功 */
--rpg-purple:      #9B59B6;  /* 特殊/レア */

/* Pixel Backgrounds */
--rpg-bg-dark:     #2C3E50;  /* ダークBG */
--rpg-bg-light:    #ECF0F1;  /* ライトBG */
--rpg-bg-paper:    #FFF8DC;  /* 羊皮紙風 */

/* Text Colors */
--rpg-text-dark:   #34495E;  /* メインテキスト */
--rpg-text-light:  #FFFFFF;  /* 明るい背景用 */
--rpg-text-gold:   #FFD700;  /* ゴールドテキスト */

/* Border & Shadow */
--rpg-border:      #34495E;  /* ピクセルボーダー */
--rpg-shadow:      rgba(0,0,0,0.5); /* ドットシャドウ */
```

### グラデーション（ピクセル風）
```css
/* 階段状グラデーション（8bit風） */
.pixel-gradient-red {
  background:
    linear-gradient(180deg,
      #FF6B6B 0%, #FF6B6B 25%,
      #E74C3C 25%, #E74C3C 50%,
      #C0392B 50%, #C0392B 75%,
      #A93226 75%, #A93226 100%
    );
}

.pixel-gradient-blue {
  background:
    linear-gradient(180deg,
      #5DADE2 0%, #5DADE2 33%,
      #3498DB 33%, #3498DB 66%,
      #2874A6 66%, #2874A6 100%
    );
}
```

---

## 📝 タイポグラフィ（ピクセルフォント）

### フォントファミリー
```css
/* ピクセルフォント（フォールバック含む） */
--font-pixel-primary: 'Press Start 2P', 'Courier New', monospace;
--font-pixel-jp: 'DotGothic16', 'Kosugi Maru', sans-serif;

/* インポート */
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=DotGothic16&display=swap');
```

### サイズとスケール
```css
/* ピクセル基準（8pxグリッド） */
--text-xs:   8px;   /* キャプション */
--text-sm:   12px;  /* 小文字 */
--text-base: 16px;  /* 本文 */
--text-lg:   20px;  /* サブ見出し */
--text-xl:   24px;  /* 見出し */
--text-2xl:  32px;  /* 大見出し */
--text-3xl:  40px;  /* タイトル */

line-height: 1.5; /* ピクセルフォントは行間広め */
```

### 使用例
```css
.rpg-title {
  font-family: var(--font-pixel-primary);
  font-size: var(--text-2xl);
  color: var(--rpg-text-gold);
  text-shadow:
    2px 2px 0 var(--rpg-border),
    4px 4px 0 var(--rpg-shadow);
  image-rendering: pixelated; /* ピクセル保持 */
}

.rpg-body {
  font-family: var(--font-pixel-jp);
  font-size: var(--text-base);
  color: var(--rpg-text-dark);
  line-height: 1.6;
}
```

---

## 🎯 コンポーネント設計

### 1. RPGウィンドウ（基本カード）
```css
.rpg-window {
  /* ピクセルボーダー（二重枠） */
  border: 4px solid var(--rpg-border);
  box-shadow:
    inset 0 0 0 2px var(--rpg-bg-light),
    inset 0 0 0 4px var(--rpg-border),
    8px 8px 0 var(--rpg-shadow);

  /* 背景（ドットパターン） */
  background:
    repeating-linear-gradient(
      90deg,
      var(--rpg-bg-paper) 0px,
      var(--rpg-bg-paper) 2px,
      transparent 2px,
      transparent 4px
    ),
    repeating-linear-gradient(
      0deg,
      var(--rpg-bg-paper) 0px,
      var(--rpg-bg-paper) 2px,
      transparent 2px,
      transparent 4px
    );

  border-radius: 0; /* ピクセルは角丸なし */
  padding: 16px;
}
```

### 2. HPバー風プログレスバー
```css
.rpg-hp-bar {
  position: relative;
  height: 24px;
  border: 3px solid var(--rpg-border);
  background: var(--rpg-bg-dark);
}

.rpg-hp-fill {
  height: 100%;
  background:
    repeating-linear-gradient(
      90deg,
      var(--rpg-green) 0px,
      var(--rpg-green) 4px,
      #27AE60 4px,
      #27AE60 8px
    );
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);

  /* ピクセル風アニメーション */
  animation: hp-pulse 1s steps(2) infinite;
}

@keyframes hp-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
}
```

### 3. RPGボタン（8bit風）
```css
.rpg-button {
  font-family: var(--font-pixel-jp);
  font-size: var(--text-base);

  /* ピクセルボーダー */
  border: 4px solid;
  border-color:
    var(--rpg-bg-light)
    var(--rpg-border)
    var(--rpg-border)
    var(--rpg-bg-light);

  background: var(--rpg-blue);
  color: white;
  padding: 12px 24px;

  /* ドットシャドウ */
  box-shadow: 4px 4px 0 var(--rpg-shadow);

  /* ホバー時 */
  transition: none; /* ピクセルは滑らかな遷移なし */
}

.rpg-button:hover {
  background: var(--rpg-yellow);
  color: var(--rpg-text-dark);
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 var(--rpg-shadow);
}

.rpg-button:active {
  transform: translate(4px, 4px);
  box-shadow: none;
}
```

### 4. ステータス表示
```css
.rpg-status {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 16px;
  background: var(--rpg-bg-dark);
  border: 4px solid var(--rpg-border);
}

.rpg-stat-item {
  text-align: center;
  padding: 12px;
  border: 2px solid var(--rpg-border);
  background: var(--rpg-bg-paper);
}

.rpg-stat-value {
  font-family: var(--font-pixel-primary);
  font-size: var(--text-2xl);
  color: var(--rpg-yellow);
  text-shadow: 2px 2px 0 var(--rpg-border);
}

.rpg-stat-label {
  font-family: var(--font-pixel-jp);
  font-size: var(--text-sm);
  color: var(--rpg-text-dark);
  margin-top: 4px;
}
```

---

## 🎭 アニメーション（RPGスタイル）

### 1. ダメージ/報酬ポップアップ
```css
@keyframes rpg-damage {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  20% {
    transform: translateY(-20px) scale(1.5);
    opacity: 1;
  }
  100% {
    transform: translateY(-60px) scale(1);
    opacity: 0;
  }
}

.rpg-popup-damage {
  animation: rpg-damage 1s steps(4) forwards;
  font-family: var(--font-pixel-primary);
  color: var(--rpg-red);
  text-shadow: 2px 2px 0 white;
}
```

### 2. カーソル点滅（選択肢）
```css
@keyframes rpg-cursor-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.rpg-cursor::before {
  content: '▶';
  color: var(--rpg-yellow);
  animation: rpg-cursor-blink 0.8s steps(1) infinite;
  margin-right: 8px;
}
```

### 3. レベルアップフラッシュ
```css
@keyframes rpg-levelup {
  0%, 100% {
    background: var(--rpg-bg-paper);
    transform: scale(1);
  }
  25%, 75% {
    background: var(--rpg-yellow);
    transform: scale(1.05);
  }
  50% {
    background: white;
    transform: scale(1.1);
  }
}

.rpg-levelup-flash {
  animation: rpg-levelup 0.6s steps(2);
}
```

### 4. ローディング（ドット3つ）
```css
@keyframes rpg-loading {
  0%, 20% { content: '.'; }
  40% { content: '..'; }
  60%, 100% { content: '...'; }
}

.rpg-loading::after {
  content: '';
  animation: rpg-loading 1.2s steps(3) infinite;
}
```

---

## 🖼️ アイコン・装飾

### ピクセルアイコン（CSS Art）
```css
/* ハート（HP） */
.pixel-heart {
  width: 16px;
  height: 16px;
  background: var(--rpg-red);
  position: relative;
  transform: rotate(45deg);
  box-shadow:
    -8px 0 0 var(--rpg-red),
    0 -8px 0 var(--rpg-red);
}

/* コイン（ゴールド） */
.pixel-coin {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background:
    radial-gradient(
      circle at 6px 6px,
      var(--rpg-yellow),
      #FFD700
    );
  border: 2px solid var(--rpg-border);
  box-shadow:
    inset -2px -2px 0 rgba(0,0,0,0.3);
}
```

### ドットパターン背景
```css
.pixel-pattern-dots {
  background-image:
    radial-gradient(circle, var(--rpg-border) 1px, transparent 1px);
  background-size: 8px 8px;
}

.pixel-pattern-grid {
  background-image:
    linear-gradient(var(--rpg-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--rpg-border) 1px, transparent 1px);
  background-size: 16px 16px;
}
```

---

## 📱 レスポンシブ（8pxグリッド）

### ブレークポイント
```css
/* ピクセル単位（8の倍数） */
--screen-xs: 320px;  /* 40 * 8px */
--screen-sm: 640px;  /* 80 * 8px */
--screen-md: 1024px; /* 128 * 8px */
--screen-lg: 1280px; /* 160 * 8px */
```

### スペーシング（8pxグリッド）
```css
--space-1: 8px;
--space-2: 16px;
--space-3: 24px;
--space-4: 32px;
--space-5: 40px;
--space-6: 48px;
--space-8: 64px;
```

---

## 🎮 インタラクション

### タッチフィードバック
```css
/* ピクセル風押し込み */
.rpg-touchable:active {
  transform: translate(2px, 2px);
  box-shadow: none;
  filter: brightness(0.9);
}

/* 選択時のハイライト */
.rpg-selected {
  outline: 4px dashed var(--rpg-yellow);
  outline-offset: 4px;
  animation: rpg-select-pulse 0.5s steps(2) infinite;
}

@keyframes rpg-select-pulse {
  0%, 100% { outline-color: var(--rpg-yellow); }
  50% { outline-color: transparent; }
}
```

---

## 📋 コンポーネント一覧

### 基本コンポーネント
```css
.rpg-window          /* メインウィンドウ */
.rpg-window-title    /* ウィンドウタイトルバー */
.rpg-button          /* ボタン */
.rpg-button-primary  /* メインボタン */
.rpg-button-danger   /* 危険なボタン */
.rpg-hp-bar          /* HPバー */
.rpg-mp-bar          /* MPバー */
.rpg-exp-bar         /* 経験値バー */
.rpg-status          /* ステータス表示 */
.rpg-menu            /* メニューリスト */
.rpg-dialog          /* ダイアログボックス */
.rpg-cursor          /* 選択カーソル */
```

### ナビゲーション
```css
.rpg-nav-bottom      /* 下部ナビ（RPGメニュー風） */
.rpg-nav-item        /* ナビアイテム */
.rpg-nav-item.active /* アクティブ状態 */
```

### カード・リスト
```css
.rpg-card            /* カード */
.rpg-card-header     /* カードヘッダー */
.rpg-card-body       /* カード本体 */
.rpg-list            /* リスト */
.rpg-list-item       /* リストアイテム */
```

---

## 🎨 使用例

### ホーム画面（RPG風）
```html
<div class="rpg-window">
  <div class="rpg-window-title">
    🎮 ポケふたクエスト
  </div>

  <div class="rpg-status">
    <div class="rpg-stat-item">
      <div class="rpg-stat-value">12</div>
      <div class="rpg-stat-label">訪問済み</div>
    </div>
    <div class="rpg-stat-item">
      <div class="rpg-stat-value">245</div>
      <div class="rpg-stat-label">総マンホール</div>
    </div>
    <div class="rpg-stat-item">
      <div class="rpg-stat-value">35</div>
      <div class="rpg-stat-label">写真</div>
    </div>
  </div>

  <button class="rpg-button rpg-button-primary">
    📷 クエスト開始
  </button>
</div>
```

---

更新日: 2025-10-09
バージョン: 2.0 (RPG Pixel Edition)
