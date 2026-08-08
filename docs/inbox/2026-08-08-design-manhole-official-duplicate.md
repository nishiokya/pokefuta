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
- 近接する別デザインの蓋も存在するため、50m以内を一律削除・拒否しない。明示確認された投稿は将来的にレビュー待ち状態へ送る。

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
- 今回は既存の公開フローを維持し、DB migration・RLS変更は追加しない。レビュー待ち状態とPostgREST直接INSERTの制限は、モデレーション設計と合わせて別途検討する。

## 関連

- pokefuta-tracker PR: https://github.com/nishiokya/pokefuta-tracker/pull/392
- 投稿API: `src/app/api/design-manholes/route.ts`
- 投稿UI: `src/app/design-manholes/new/page.tsx`
- 訪問写真API: `src/app/api/image-upload/route.ts`
- RLS: `database/migrations/archive/019_design_manhole_rls_policies.sql`
