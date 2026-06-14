# 修正指示書（plan用 / マスター）: 全PRをクローズし、PC・SP ともリファレンスデザインに作り直す

> 対象: Claude Code（plan モードにそのまま貼る）
> **この1本が最上位の作業計画。** 進行中のPRは**すべてクローズ**し、ここから作り直す。
> 実装の正 = `reference/` のデザイン（HTMLプロトタイプ）。トークン = `README §7`。データモデル = `README §2.5`。
> 各画面の詳細仕様は個別の `FIX_INSTRUCTIONS_*` に分割済み。本書は**全体マップと順序**を示す。

---

## 0. 方針（なぜ作り直すか）
画面ごとの小PRを積む方式では、PC幅の不一致・詳細ページの二重テンプレート・スタンプ帳/マイ旅の責務被りが収束しなかった。**仕様の二重化（例: PCの 372 vs 360）**が根因。よって:

1. **進行中のPRはすべてクローズ。**
2. **正は `reference/` の1セット**に固定（README/各指示書の数値はこれに一致済み）。
3. **PC・SP の全ログイン後画面を、このリファレンスに合わせて作り直す。**
4. 1機能=1ブランチで小さく出すが、**数値・コピー・骨格はリファレンス固定**（独自値を足さない）。

> リファレンスはHTML/JSXのプロトタイプ。**そのまま貼らない**。対象コードベースの既存DS/コンポーネントで作り直し、無いトークンだけ `README §7` を使う（`README §1`）。

---

## 1. 全画面マップ（route → リファレンス → 指示書）

### 共通シェル
| 面 | チップ | リファレンス | 内容 |
|---|---|---|---|
| **SP（≤1023px）** | `ui.jsx` の `App` ＋ `TabBar` | アプリ枠（上ヘッダー＋下タブ）。ログイン後タブ = **`NAV_MYTRIP`（探す / スタンプ帳 / マイ旅）** | 設計幅 390px |
| **PC（≥1024px）** | `screens-PC.jsx` の `PC_Shell` ＋ `PC_TopNav` | フレーム1120 / ガター32 / 本文1fr ＋ 右レール360(sticky) | `FIX_INSTRUCTIONS_pc_unified_layout.md` |

### ページ
| route | 画面 | SP リファレンス | PC リファレンス | 詳細指示書 |
|---|---|---|---|---|
| 詳細（例 `/manhole/[id]`） | ポケふた詳細 | `screens-Unified.jsx` `U_Detail`（**1テンプレート**・empty/posted を内部出し分け） | `PC_Detail` / `PC_Detail_Posted`（`PC_Shell` に載せ、1テンプレート化） | `FIX_INSTRUCTIONS_detail_unified_plan.md` |
| `/visits`（スタンプ帳） | スタンプ帳＝コレクションブック | `screens-Stampbook.jsx` **`Stampbook2`**（PHOTO DEXコンパクト＋集めたスタンプ壁＋都道府県/ポケモン/特徴/コンプリート目前） | `PC_Home`（`PC_Shell`・本文=コレクション / レール=図鑑集計＋撮りに行く） | `FIX_INSTRUCTIONS_stampbook_plan.md` ＋ `FIX_INSTRUCTIONS_stampbook_v2_density.md` |
| `/my-trip`（マイ旅） | 旅日記（時系列・写真主役） | `screens-MyTrip.jsx` `MyTrip` | `PC_Shell`（本文=旅日記タイムライン / レール=旅サマリ。**写真追加CTAは置かない**） | `FIX_INSTRUCTIONS_mytrip_plan.md` |
| 探す/地図（`/search` 等） | 一覧・地図 | 既存（本リビルドでは骨格のみ統一） | `PC_Shell`（本文=一覧/地図 / レール=絞り込み・選択ピン要約） | 幅規約のみ `pc_unified_layout` に従う |

> 投稿フロー（撮影→フォーム→完了）は `README §3`/`§5` の `<PhotoPrompt>` 挙動に従う。詳細・探す（未訪問側）でのみ写真投稿を促す。

---

## 2. 全ブランチ共通の前提（リビルドの土台・先に固定）

### 2.1 データモデル（`README §2.5`）★最重要
- **全国総数 = 470**。コレクション分母は常に 470。
- **訪問 = 撮影 = 1スタンプ**。「訪問したが未撮影」の個人ギャップは無い（`52/80` 等の訪問≠撮影表現は誤り）。個人コレクション = 例 `80/470`（達成率≈17%）。
- **写真投稿KPI（写真0枚/一番乗り）は「未訪問マンホール」の話**。導線は詳細／探すの `<PhotoPrompt>`。
- **マイ旅（過去の訪問）に「写真を追加」CTAは置かない**（既に撮影済み）。

### 2.2 デザイントークン（`README §7`）
色・角丸・影・余白・タイポは確定値。既存DSにマッピングし、無いものだけ §7 を採用。フォント = Zen Kaku Gothic New / M PLUS Rounded 1c / Outfit（数字）。

### 2.3 PC骨格（`FIX_INSTRUCTIONS_pc_unified_layout.md`）
全PCページが単一 `PC_Shell`（1120 / 32 / 1fr+28+360 sticky）。ページ側に幅・ガター・グリッドのハードコードを書かない。視覚確認: `reference/ポケふた PC統一レイアウト.html`。

### 2.4 SPチロム（`ui.jsx`）
`App`（ヘッダー: ロゴ＋タイトル＋認証チップ）＋ `TabBar`。ログイン後は `NAV_MYTRIP`。設計幅390px、画面padding16px、カード余白14–16px。

---

## 3. 作業順序（依存の少ない順・1機能1ブランチ）

| 順 | ブランチ | 中身 | SP | PC |
|---|---|---|---|---|
| ① | `fix/data-model-470` | §2.1 を全画面で徹底（分母470 / 訪問=撮影） | ✓ | ✓ |
| ② | `feat/pc-shell` | `PC_Shell` を1つ実装し、既存PCページを載せ替え（幅統一） | – | ✓ |
| ③ | `feat/detail-unify` | 詳細を**1テンプレート**化（`U_Detail`/PCも）。「あとで」全画面トグル廃止 | ✓ | ✓ |
| ④ | `feat/collection-split` | スタンプ帳=`Stampbook2`（コレクションブック）＋ マイ旅=`MyTrip`（旅日記）を**セットで**。PCは `PC_Home`＋マイ旅を `PC_Shell` に | ✓ | ✓ |

**理由メモ**:
- **②を先に**入れると、③④はPC側で中身を `PC_Shell` に流すだけで幅が揃う。
- **④はスタンプ帳とマイ旅をセットで1PR**。片方だけ出すと責務（コレクション⇄旅日記）が被った2画面が併存する。両方そろって初めて分離が成立。
- ③④は**SPとPCを同じPRで**出す（同一画面の2フォーム。片面だけ更新すると不整合）。

> デグレ防止: 各PRはマージ後の画面が**現状より悪くならない**こと。スタンプ帳は中間状態を出さず④で全部入り1回。

---

## 4. 各PRでの読む順（テンプレ）
1. 本書（マスター）で route→リファレンス→順序を確認。
2. `README §2.5`（データモデル）＋ `§7`（トークン）。
3. PCを触るなら `FIX_INSTRUCTIONS_pc_unified_layout.md`。
4. そのPRの個別 `FIX_INSTRUCTIONS_*` を plan に貼る。
5. `reference/` の該当 `screens-*.jsx` を見ながら**既存DSで作り直す**（reference は参照であって貼付元でない）。
6. 各指示書末尾の受け入れ基準を満たすか確認。

---

## 5. 完了の定義（全体・Done）
- [ ] 進行中PRが全てクローズされ、本マップの①〜④に再編されている。
- [ ] **詳細ページが1テンプレート**（SP/PCとも。全画面トグル無し）。
- [ ] **スタンプ帳=コレクションブック / マイ旅=旅日記** に責務分離（SP/PCとも）。マイ旅に写真追加CTAが無い。
- [ ] 全PCページが単一 `PC_Shell`（1120/32/1fr+28+360）。`reference/ポケふた PC統一レイアウト.html` のガイド線 `x=32/700/728/1088` に端が一致。
- [ ] 全画面で分母 **470**・訪問=撮影。`52/80` 等の旧表現が消えている。
- [ ] 旧PCの `372 / gap24 / padding28 / max-1040`、旧詳細テンプレ（NEXT STAMPヒーロー等）への参照がコードから消去。
- [ ] ピル=塗りティント、字体・余白・影が `README §7` 準拠。

---

## 6. 参照（このバンドル内）
- `00_START_HERE.md` — オーケストレーション（本書が最上位）。
- `FIX_INSTRUCTIONS_pc_unified_layout.md` — PC骨格統一。
- `FIX_INSTRUCTIONS_detail_unified_plan.md` — 詳細1テンプレート。
- `FIX_INSTRUCTIONS_stampbook_plan.md` ＋ `FIX_INSTRUCTIONS_stampbook_v2_density.md` — スタンプ帳。
- `FIX_INSTRUCTIONS_mytrip_plan.md` — マイ旅。
- `FIX_INSTRUCTIONS_plan.md` — 初回レビュー差分（①に取り込み）。
- `README.md` — 全体仕様（§2.5 データモデル / §7 トークン / `PhotoPrompt` API）。
- `reference/` — 正となるデザイン（`screens-*.jsx`、プレビュー `ポケふた 写真投稿導線 3案.html` / PC統一 `ポケふた PC統一レイアウト.html`）。
