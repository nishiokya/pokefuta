# 公式ポケふたのデザインマンホール誤投稿を防ぐ

## 状況

- 対象投稿: `d4864c49-5170-4dc0-a524-a7fbf92be958`
- 投稿者表示名: `おさかな`
- 投稿座標: `40.5379444444444, 141.558027777778`
- 公式ポケふた: `pokefuta:157`（青森県/八戸市、イシツブテ・キャモメ）
- 公式座標との差: 約1m
- tracker: PR #392 で `nearby_ref=pokefuta:157`、`review_status=needs_review`

写真と座標が公式ポケふた ID 157 と一致するため、訪問写真をデザインマンホールとして登録した誤投稿と判断した。

## 2026-08-08 の対応

- pokefuta本番DBの対象行を `published` から `hidden` に変更した。
- キャッシュを避けた公開確認で、一覧に対象IDが含まれないことを確認した。
- 詳細ページと写真APIがともに `404` になることを確認した。
- 写真オブジェクトとDB行は削除していない。`hidden` 化のみのため復元可能。
- tracker側のPR・データ補正は別途手動で対応する。

## 原因

- `/design-manholes/new` はEXIF座標を読み取るが、公式ポケふたとの照合を行わない。
- UIに「登録済みマンホールとの照合はないため、どの場所でも投稿できます」と表示している。
- `POST /api/design-manholes` は認証、画像、国内座標のみを検証し、公式マンホールとの距離を検証しない。
- `design_manhole.status` は初期値が `published` で、投稿直後に公開される。
- デザインマンホール投稿の自動テストがない。

## 対応方針

### UI

- 写真のEXIF座標を取得した時点で、50m以内の公式ポケふた候補を検索する。
- 候補があれば公式名、登場ポケモン、距離を表示する。
- 主ボタンを「訪問写真として登録」にし、`/upload?manhole_id=<id>` へ誘導する。
- 「別のマンホールです」は副導線にする。
- 「登録済みマンホールとの照合はないため、どの場所でも投稿できます」という文言を削除する。

### サーバー

- `POST /api/design-manholes` でも、ストレージへのアップロード前に公式ポケふたとの距離を検証する。
- 公式候補が近い場合は `409 OFFICIAL_MANHOLE_NEARBY` と候補情報、訪問投稿URLを返す。
- UIを迂回した直接リクエストでも自動公開できないことを保証する。
- 近接する別デザインの蓋も存在するため、50m以内を一律削除・拒否しない。明示確認された投稿はレビュー待ち状態へ送る。

### DB・権限

- `pending` または `needs_review` 状態の追加を検討する。
- 認証ユーザーによるテーブル直接INSERTで距離検証を迂回できないよう、限定RPCまたはDBトリガーへ検証を集約する。
- anon/authenticated に公開している `created_by`、`storage_key` などの列権限も見直す。

## 受け入れ条件

- 公式ポケふたから約1mの写真はデザインマンホールとして即時公開されない。
- 近接候補が表示され、訪問写真投稿へ1操作で移動できる。
- 近接する別の蓋は、ユーザー確認後にレビュー対象として扱える。
- 50mより離れた通常のデザインマンホール投稿は従来どおり登録できる。
- APIを直接呼んでも同じ判定になる。
- 上記ケースの自動テストが追加されている。

## 実装PRでの対応

- UIと投稿APIで共通の50m判定を使い、公式候補の名称・ポケモン・距離を表示する。
- 公式候補がある場合の主導線を `/upload?manhole_id=<id>` にし、「別のマンホールです」の明示確認を副導線にする。
- APIはストレージアップロード前に公式データを再照合する。未確認または候補IDと異なる確認は `409 OFFICIAL_MANHOLE_NEARBY` にする。
- 公式データを取得できない場合は `503 OFFICIAL_MANHOLE_CHECK_UNAVAILABLE` とし、照合できない状態では投稿を受け付けない。
- APIの成功レスポンスは `official_manhole_check.result` で、50m超の通常投稿 (`clear`) と確認済みの近接する別デザイン蓋 (`confirmed_different`) を区別する。
- 近接確認済みの投稿は `pending` または `needs_review` として永続化し、公開一覧から除外する。
- PostgREST直接INSERTでこの制約を迂回できないよう、限定RPCまたはDBトリガーへ検証を集約する。

## PR #198 レビューでの追加修正（マージ前に必須）

1. **近接確認済み投稿を即時公開しない**
   - `confirmed_different` をレスポンスに返すだけでなくDBへ保存する。
   - 50m以内の投稿は `pending` / `needs_review` として永続化し、公開一覧から除外する。
   - APIを迂回した直接INSERTでも即時公開できないよう、限定RPCまたはDBトリガーで保証する。
2. **写真差替え時の古いEXIF結果を破棄する**
   - `onDrop` 冒頭で世代IDを採番する。
   - EXIF解析後、近接検索後、`finally` の状態更新を同じ世代IDでガードし、古い写真の座標や判定で新しい写真を上書きしない。
3. **追加テストをNode 20のCIで実行する**
   - Node 22.6以降専用の `--experimental-strip-types` に依存しない実行方法へ変更する。
   - GitHub Actionsで `npm run test:design-manhole` を実行し、CIの緑が追加テストの成功も保証するようにする。

修正後は、追加テスト、type-check、buildを実行し、PR #198へpushして再レビューを依頼する。

## PR #198 レビュー指摘への対応結果

- `design_manhole.status` に `needs_review` を追加し、近接候補ID・距離・明示確認日時を永続化するmigrationを追加した。
- `public.manhole.location` を使う `BEFORE INSERT` トリガーで50m以内を再計算し、`published` の直接INSERTも `needs_review` へ強制する。RLSは本人名義の `published` / `needs_review` のみ許可する。
- APIは `confirmed_different` を `needs_review` でINSERTし、成功画面も「確認待ち」表示にして、公開前の詳細ページやX共有へ誘導しない。
- 写真選択ごとの世代IDを `onDrop` 冒頭で採番し、EXIF解析後、近接検索後、例外処理、`finally` の全更新を同じ世代でガードした。
- テスト実行を `tsx --test` へ変更し、Node 20の既存GitHub Actionsに `npm run test:design-manhole` を追加した。
- 検証: Node 20.20.2を含む自動テスト12件、`npm run type-check`、CI相当のダミー環境変数を使った `npm run build` が成功した。
- migrationの追加のみで、本番DBへの適用・デプロイ・マージは行っていない。

## tracker Draft PR #394 の敵対的レビュー

対象: https://github.com/nishiokya/pokefuta-tracker/pull/394

結論: 近接候補を公開データから外す方向は正しい。ただし、以下2点を直すまでは Draft のままにする。

### [P1] 公開抽出を fail-closed にする

`select_public_records()` は現在 `review_status != "needs_review"` だけで抽出している。このdenylist方式では、`status="pending"` / `hidden` の行や、将来追加された未知のレビュー状態が `docs/design_manholes.ndjson` に入る。地図側が `status == "active"` で再度絞っていても、NDJSON自体は公開・配布されるため境界として不十分。

公開条件は少なくとも次の両方を満たすallowlistにする。

- `status == "active"`
- `review_status` が公開を許可した既知の状態である（または最低限 `needs_review` でないことを追加条件にする）

テストには `pending`、`hidden`、未知の `review_status` が公開出力へ入らないケースを追加する。

### [P1] 非公開にした候補をレビューキューへ残す

現在の `normalized_records` はメモリ上にしか存在せず、`needs_review` 行は `docs/design_manholes.ndjson` から消える。ステージされるraw snapshotには投稿ID・座標はあるが、`nearby_refs`、距離、候補名、レビュー理由がない。そのためFamily BのPRを人が見ても、何と重複しそうなのか、どのoverrideを追加すべきか判断できない。

公開出力とは別に、例えば `dataset/design_manhole_review_queue.ndjson` を生成・ステージし、少なくとも次を残す。

- `source_id`
- `nearby_refs`（ref、距離、候補名）
- `review_status`
- `status`
- 投稿写真・投稿詳細へのURL

テストには「ID 157は公開NDJSONへ入らないが、レビューキューには `pokefuta:157` と約1mで残る」ことを追加する。

### pokefuta #198 との引き渡し条件

pokefuta #198 の `confirmed_different` は、現行差分ではPOST成功レスポンス上の区別に留まり、DBや公開GET APIへ永続化されていない。したがって、公式ポケふた50m以内の正当な別デザイン蓋もtrackerでは `needs_review` になる。これは安全側の挙動として許容できるが、上記レビューキューがないと正当投稿を復帰させる運用が成立しない。

### マージ判断

- ID 157を公開対象から外す回帰テストは妥当。
- `create-pull-request` の無条件実行、concurrency、timeout追加も妥当。
- 上記2件を修正し、公開データとレビューキューの両方を統合テストした後にマージする。

## 相互監視・最終確認結果

### pokefuta-tracker

- PR #394 は、公開抽出を `status == "active"` かつ既知の公開許可 `review_status` に限定するallowlist方式へ修正した。
- 非公開候補は `dataset/design_manhole_review_queue.ndjson` へ残し、投稿ID、近接候補、距離、レビュー状態、投稿URLを確認できるようにした。
- ID 157が公開NDJSONへ入らず、レビューキューへ `pokefuta:157` と約1mで残る回帰テストを含む14テストとGitHub CIが成功した。
- PR #394 は最終HEAD `9f42fcb84378e8944a1025d4fe16625d40d4fdfd`、merge commit `b44d88b80274b795661e0eedc49944a5b4d38c8b` で2026-08-08にsquash merge済み。上記の敵対的レビュー指摘は解消済み。
- 後続の日次データPR #395も成功し、2026-08-08にmerge済み。PR #392は誤投稿を含む旧PRとしてclosed・未mergeのまま。

### pokefuta PR #198

- 最新実装HEAD `4cdfd76eb28e6b03c1ccc3924f885760e48b5b36` を再レビューし、追加の品質問題は見つからなかった。
- 近接確認済み投稿の `needs_review` 永続化、公開API・写真APIからの除外、50m以内の直接INSERTを抑止するDBトリガーとRLSを確認した。
- 写真差替え時のEXIF解析・近接検索・例外処理・`finally` は同じ写真世代でガードされ、古い非同期結果が新しい写真へ反映されないことを確認した。
- inbox更新後の最終HEAD `72ec9429ac0dd0bf645497ed75518944af43c9b5` でも、GitHub ActionsはNode 20で `npm run test:design-manhole` を実行して成功し、競合なし・mergeableを再確認した。
- PR #198はDraft解除後、2026-08-08にmerge commit `fa311e99ed4d4c29dd4b1c58acd9989c4ced8814` でsquash merge済み。
- 最終状態: pokefuta PR #198、pokefuta-tracker PR #394、後続の日次データPR #395はいずれもmerge済み。追加の未処理inbox指示はない。
- 本番DBへのmigration適用とデプロイは行っていない。再発防止を本番で有効にする作業は別途必要。

## 関連

- pokefuta-tracker PR: https://github.com/nishiokya/pokefuta-tracker/pull/392
- pokefuta-tracker 再発防止 Draft PR: https://github.com/nishiokya/pokefuta-tracker/pull/394
- 投稿API: `src/app/api/design-manholes/route.ts`
- 投稿UI: `src/app/design-manholes/new/page.tsx`
- 訪問写真API: `src/app/api/image-upload/route.ts`
- RLS: `database/migrations/archive/019_design_manhole_rls_policies.sql`
