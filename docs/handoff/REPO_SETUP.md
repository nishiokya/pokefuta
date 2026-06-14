# REPO SETUP — このハンドオフをリポジトリに置くための手順

このフォルダ（`docs/handoff/`）をアプリのリポジトリにそのままコミットすれば、Claude Code がパス参照で読めます。zip を都度渡す運用より、同期・版管理・PR参照の面で優れます。

---

## 1. 配置
```
<repo>/
  CLAUDE.md                      ← 下の §2 を追記（無ければ新規作成）
  docs/handoff/                  ← このフォルダ一式をコミット
    00_START_HERE.md
    README.md
    REPO_SETUP.md                ← 本ファイル
    FIX_INSTRUCTIONS_*.md
    PhotoPrompt.template.tsx
    reference/                   ← 参照デザイン（本番コードではない）
```

## 2. リポジトリ直下 `CLAUDE.md` に追記（自動誘導）
Claude Code は repo 直下の `CLAUDE.md` を自動で読みます。以下を追記しておくと、毎回の指示なしで入口に辿れます。

```md
## 設計ハンドオフ（UX修正）
UX修正・リデザインに着手する前に、必ず docs/handoff/00_START_HERE.md を読むこと。
- データモデルとトークン: docs/handoff/README.md（§2.5 データモデル / §7 トークン）
- 各PRの個別指示: docs/handoff/FIX_INSTRUCTIONS_*.md
- 実装の正となるデザイン: docs/handoff/reference/（screens-*.jsx・プレビュー .html）
  ※ reference/ は「参照デザイン」であり本番コードではない。既存のDS/コンポーネントで作り直す。ビルド/型/Lintの対象外。
```

## 3. ビルド / 型 / Lint から除外（重要）
`reference/` の `.jsx` / `.html` はデザイン参照で、CDN版 React + Babel 前提のモックです。**本番のビルド・型チェック・Lintに混ぜると壊れます。** 各ツールで `docs/handoff/**` を除外してください。

**tsconfig.json**
```jsonc
{
  "exclude": ["docs/handoff"]
}
```

**.eslintignore（または eslint flat config の ignores）**
```
docs/handoff/**
```

**.prettierignore**
```
docs/handoff/**
```

**バンドラ（Vite/Next/webpack 等）**: `docs/` はアプリの import グラフ外なので通常は自動的に無視されます。明示的に `pages`/`app` ルーティング配下へ置かないこと。

## 4. 更新フロー
- 設計が変わったら、**指示書もコミット**（設計更新だけの小さい PR か main 直 push）。Claude Code は常にそのブランチの最新を読む。
- 各実装 PR は「どの指示書（どのコミット）に基づくか」を説明に明記。
- ブランチ運用は `00_START_HERE.md §2` を参照（スタンプ帳は中間状態を出さない／④はスタンプ帳＋マイ旅セット 等）。

## 5. reference/ の中身
- `screens-*.jsx` … 画面ごとの参照デザイン（読みやすい単位）。
- `ポケふた 写真投稿導線 3案.html` … 上記を読み込む人間用プレビュー（`docs/handoff/reference/` で開けば描画）。
- `design-canvas.jsx` … プレビューの比較キャンバス基盤（実装には不要）。
- ※ 連結版 `bundle.jsx` は同梱しない（個別ファイルで足りる・軽量化のため）。
