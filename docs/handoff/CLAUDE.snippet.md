## 設計ハンドオフ（UX修正）
UX修正・リデザインに着手する前に、必ず docs/handoff/00_START_HERE.md を読むこと。
- データモデルとトークン: docs/handoff/README.md（§2.5 データモデル / §7 トークン）
- 各PRの個別指示: docs/handoff/FIX_INSTRUCTIONS_*.md
- 実装の正となるデザイン: docs/handoff/reference/（screens-*.jsx・プレビュー .html）
  ※ reference/ は「参照デザイン」であり本番コードではない。既存のDS/コンポーネントで作り直す。ビルド/型/Lintの対象外（tsconfig / eslint / prettier で docs/handoff/** を除外）。
