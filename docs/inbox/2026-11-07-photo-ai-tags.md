# 写真館の公開用 AI タグ追加

人物・雪・紅葉・足元を追加。採用基準は独立した検証データの適合率50%以上。
仕様・最新成績・反映順は [photo-ai-tags](../photo-ai-tags.md)。

## K11の状態

- 元ソース: `/home/tako/projects/manhole-score`（remote未設定）、元HEAD `76a3df0`。
- 隔離worktree: `/tmp/manhole-score-ai-tags`、ブランチ `codex/expand-ai-tags`。
- 最新実装: `de5cc84f48d740c9ce2c8cdb109e557a8ac70f07`。先行 `c670049` だけではレビュー修正が入らない。
- 固定モデル: `/home/tako/projects/manhole-score/models/public_attrs_v2.pkl`、成績は同じ場所の `public_attrs_v2.json`。
- SHA256: `b9efd9b4f2eb6d3ff95537c42f69af65f183623e9aff202d07de28a80d0e1b40`。
- 旧 `public_attrs_v1.pkl` は未公開の比較用。今回の配信には使わない。既存のシーン・代表写真モデルは不変。
- 元worktreeの既存未追跡 `scripts/ablate_ranker.py` には触れていない。
- 本番ジョブのソース・systemd・DB・写真はまだ切り替えていない。

## 適用

同梱 [パッチ](2026-11-07-k11-public-attrs.patch) は元HEADに対する前後3行つきの累積差分。
適用先の状態を確認し、`git apply --check` → `git apply` で4ファイルを適用する。
元のK11で通常の `git apply --check` が成功することを確認済み。行番号だけで当てる `--unidiff-zero` は使わない。
パッチファイルだけ `.gitattributes` で空白検査を除外する（空行コンテキストの単一スペースはパッチの構文）。

すでに先行版を適用した場合は累積パッチを重ねず、K11ブランチの追補 `de5cc84` を使う。
基準cloneがdirtyなまま自動適用しない。モデル版・成績・SHAを確認後、DB→K11→全件採点→アプリの順に反映する。
別の環境では先に `public_attrs.py` を用意し `--train` する。検証結果が50%未満の属性は配信しない。
モデルは検証データを含めて学習し直さない。

## レビュー対応と検証

自動レビューの初回結果は指摘なしだったが、その後のClaude Codeレビュー10件を確認して修正・検証した。
最新mainの #442 と重複したmigration番号は `20261107130000_photo_ai_tags_attributes.sql` に変更済み。

- Python回帰テスト4件: 合格。合格条件のNaN/欠損/境界、学習・閾値選択からの検証隔離、ID逆順と欠落、枠欠損、丸めとサイズ制限を検証。
- K11実写真は枠あり12枚・枠なし12枚で、4属性の学習/推論・ID逆順の結果一致。既存タグ・切り抜き情報も不変。
- 全キー・最長モデル名・長い小数を含む検証値は、丸め後のPostgreSQL `jsonb::text` で425/500バイト。
- K11ローカルDBで新migrationとscorer権限・入力検査を全件実行して合格、ROLLBACK済み。各属性のtrue/false双方でモデル版欠落を拒否。
  ローカルのpg_net警告は既知。本番権限の検査を無効にしていない。
- アプリのタグ表示23テスト・型/GA4等の契約検査: 合格。小さいタイルから人物・足元を除くことも検証。
- レビュー修正後の本番ビルドも合格（ローカル向けの仮設定を使い、本番の接続情報は不使用）。

`validate_ai_tags` の関数分離は今回行わない。scoringの関数追加には監査の許可リスト変更も伴うため、
今回は既存の署名・権限と入力検査の回帰テストを維持し、分離は別の変更として扱う。
