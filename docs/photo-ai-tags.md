# 写真の AI タグ（ぬいぐるみ・夜・風景）

写真に「AI」の印付きでタグを出す。判定は k11 の manhole-score が毎朝の自動採点で行い、
`photo.ai_tags` に書く。アプリは判定しない。

| タグ | 判定 | 出す条件 |
|---|---|---|
| ぬいぐるみ | 学習した分類器（ResNet-50 埋め込み＋COCO 検出器など）。注釈 1836 枚で 適合 0.86 / 再現 0.77 | `ai_tags.plush = true` |
| 夜 | 撮影時刻（EXIF）と蓋の位置から求めた太陽高度が −6° 未満 | `ai_tags.night = true` |
| 風景 | シーン分類（中心・周辺・看板・風景）の風景 | `ai_tags.scene = 'landscape'` かつ投稿者が「周辺の風景」を選んでいない |

- 周辺（`wide_context`）は写真の半分以上に付くのでタグにしない。看板は教師が足りないので出さない
- 投稿者の「周辺の風景」（`is_landscape`）を上書きしない。代表写真・写真の充足率の計算にも使わない
- 投稿者が AI のタグを外す操作はまだ無い。外れが目立ったら上書き用の列を足す

## 書き込み経路

`scoring.apply_photo_scores` の各行に任意の `ai_tags` を足せる（`20261004100000_photo_ai_tags.sql`）。
中身は型から検査し、知らないキー・範囲外・500 バイト超は拒否する。関数の署名は変えていないので、
`scoring.audit_photo_scorer()` の許可リストはそのまま。利用者からの書き換えは
`photo_protect_quality_score` トリガが元に戻す。

## 公開の順番

1. マイグレーションを本番に適用する。有効な版が `quality_score/0.3.0` になり、k11 の 0.2.0 のジョブは止まる（止まるのが正しい）
2. k11 の manhole-score を 0.3.0（`ai_tags` を書く版）に切り替える。翌朝 05:15 の実行で既存の全写真に `ai_tags` が入る
3. 写真館（この PR のアプリ側）を出す。`ai_tags` が NULL の写真にはタグが出ないだけなので、1 と 2 の前に出ても壊れない

確認: `npm run verify:photo-scorer`（ローカル）、本番は適用後に `select count(*) from photo where ai_tags is not null`。
