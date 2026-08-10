# Repository guidance

- Treat `app_user` profile data as public only through narrowly scoped `SECURITY DEFINER` functions. Do not grant anonymous table access.
- Keep `src/types/database.ts` in sync when a database migration adds or changes profile fields.
- A user may edit only the profile associated with `auth.uid()`; enforce this in the database as well as in the UI.
- GA4 は `pokefuta.com` / `www.pokefuta.com` だけで送信する。`localhost`、プレビューURL、開発端末名からは送らない。
- ページ表示は標準の `page_view` を1回だけ送る。`page_location` は `code`・token・OAuthエラーを除去し、`from=data`など安全な計測情報は残す。
- `data.pokefuta.com` からの遷移はクロスドメインリンカーを正とし、内部UTMは付けない。`from=data` を `source_app=tracker` と `p_data_referral` で計測する。
- イベント発生箇所は `surface` で表す。GA4の流入元予約語 `source` をカスタムイベント引数に使わない。
- エラーイベントは `p_api_error` / `p_auth_error` / `p_app_error` を使う。旧キーイベント名 `error_event` / `auth_error` は送信しない。

## 投稿ファネル

写真館の目的は投稿が積まれること。ファネルの計測はUXの指標であると同時に、
**投稿が全部落ちていることに気づく唯一の手段**なので、片方のフローだけ計測する状態を作らない。

イベント名の台帳は `SUBMISSION_FUNNEL_EVENTS`（`src/lib/analytics/gtag.ts`）。
`tools/check-ga4-contract.js` が台帳・両フローの網羅・`block_reason` 全値の使用を検査する
（`npm run type-check` に同梱）。

| # | ステップ | イベント |
|---|---|---|
| 1 | 投稿導線のクリック（内訳用） | `p_submission_entry` |
| 2 | **投稿画面に到達（ファネルの分母）** | `p_submission_start` |
| 3 | 写真を選んだ | `p_submission_photo_selected` |
| 4 | 送信に進めず止まった | `p_submission_blocked` |
| 5 | 送信した | `p_photo_upload_start` |
| 6a | **完了（キーイベント）** | `p_photo_upload_complete` |
| 6b | 失敗 | `p_submission_failed` |
| 6c | 投稿せず離脱 | `p_submission_abandoned` |

- キャラふた / デザインふたは `submission_kind`（`character` / `design`）で出し分ける。
  イベント名は分けない — 分けると探索を2本作ることになり、片方の劣化に気づけない。
- 分母は導線クリックではなく**画面到達**にする。導線は各ページに散っており取りこぼすが、到達は100%取れる。
- ステップ 2・3・4・6c は `useSubmissionFunnel`（`src/lib/hooks/useSubmissionFunnel.ts`）が送る。
  離脱は `pagehide` で1回だけ。`visibilitychange` は使わない（アプリ切替で戻る人まで離脱に数えるため）。
- `return` するだけの分岐を足したら、`SUBMISSION_BLOCK_REASONS` にも足して `funnel.blocked()` を呼ぶ。
  静かに止まる経路を残さない。
- 写真の入力手段は `photo_source`（`camera` / `library`）。`invalid_gps` の主因を説明できる唯一の軸。
- **エラーをキーイベントにしない。** `p_submission_failed` / `p_api_error` / `p_app_error` は
  探索とカスタムインサイトで見る（旧 `error_event` / `auth_error` をキーイベント登録して
  イベント名ごと捨てた経緯がある）。
- 投稿APIは失敗時に機械可読な `code` を返す（`src/lib/api-error-code.ts`）。
  利用者向けの文言は変えず、生のDBメッセージはクライアントへ返さない。
  クライアントはこれを `p_submission_failed.error_code` に載せる。

### GA4 管理画面での設定（コードでは変えられない）

**カスタムディメンションはデプロイより先に登録する。** GA4 は遡って適用しないので、
登録前に届いたイベントのパラメータは探索から永久に参照できない。

1. カスタムディメンション（イベントスコープ）を登録:
   `submission_kind` / `block_reason` / `error_code` / `error_type` / `stage` / `last_step` /
   `photo_source` / `review_status` / `surface` / `prefecture` / `page_type` / `is_logged_in` /
   `source_app` / `site_type`
2. カスタム指標: `upload_duration_ms`、`dwell_ms`（いずれもミリ秒）
3. キーイベント: `p_photo_upload_complete`（主要コンバージョン）、`p_signup_complete`
4. 探索（目標到達プロセス）: ステップ 2 → 3 → 5 → 6a、内訳ディメンション `submission_kind`。
   離脱理由は `p_submission_blocked` を `block_reason` で分解した経路データ探索を併設する
5. カスタムインサイト（異常検知）: `p_photo_upload_complete` の日次件数が急減したらメール通知
