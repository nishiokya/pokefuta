# 写真館の公開用 AI タグ追加

人物・雪・紅葉・足元を追加。採用基準は折り外の適合率50%以上（写真ごとの確率50%以上ではない）。
仕様・成績・反映順は [photo-ai-tags](../photo-ai-tags.md)。

## K11

- ソース: `/home/tako/projects/manhole-score`（remote未設定）
- 隔離worktree: `/tmp/manhole-score-ai-tags`、ブランチ `codex/expand-ai-tags`
- 元のHEAD: `76a3df0`、実装コミット: `c670049b9bb5865b4a0e8bc9171b0c7f6fbcb3cb`
- 固定済みモデル: `/home/tako/projects/manhole-score/models/public_attrs_v1.pkl`
- SHA256: `d195e9671aa5100067b37cc767528edc9e7b1267339bd24e05783e5f5d7bf94c`
- 成績: 同じ場所の `public_attrs_v1.json`。雪は最初の確認以降の教師の更新により閾値0.70→0.51、適合率0.700→0.696。
- データ・既存モデル・venvは元のプロジェクトを参照。新しい公開用モデルだけ追加した。既存モデルを上書きしていない。
- 元のworktreeには既存の未追跡 `scripts/ablate_ranker.py` がある。触れていない。
- 本番ジョブのソース・systemd・DB・写真はまだ切り替えていない。

同梱 [パッチ](2026-11-07-k11-public-attrs.patch) はGitで共有する正本。
適用先で既存変更を確認し、`git apply --unidiff-zero --check` → `git apply --unidiff-zero` で3ファイルを適用できる。
K11のコミットを使う場合はDB適用後にcherry-pickする。基準cloneがdirtyなまま自動適用しない。
先に公開用モデルの存在・版・成績を確認する。モデルがない環境ではパッチから `public_attrs.py` を用意し学習してから切り替える。

## 検証

- 写真一覧関連64テスト、型検査・GA4等の契約検査: 合格。
- K11ローカルSupabase DB: 新migrationと `tools/verify-photo-scorer.sql` を同一トランザクションで実行し全項目合格、ROLLBACK済み。
  pg_netのローカル既知警告あり。本番の権限検査を無効にする変更はない。
- K11: 24枚×4属性で学習時と新着推論の判定が一致。
- K11: 同じ24枚で既存のシーン・ぬいぐるみ・夜・切り抜き情報の値が変更前と完全一致。
- Next.jsの本番ビルド: 合格（既存のlint警告あり）。型検査はローカル設定なしで実行。
- 本番への反映と全件再採点は未実施。
