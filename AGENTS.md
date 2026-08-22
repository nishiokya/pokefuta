# Repository guidance

- Treat `app_user` profile data as public only through narrowly scoped `SECURITY DEFINER` functions. Do not grant anonymous table access.
- Keep `src/types/database.ts` in sync when a database migration adds or changes profile fields.
- A user may edit only the profile associated with `auth.uid()`; enforce this in the database as well as in the UI.
- GA4 は `pokefuta.com` / `www.pokefuta.com` だけで送信する。`localhost`、プレビューURL、開発端末名からは送らない。
- ページ表示は標準の `page_view` を1回だけ送る。`page_location` は `code`・token・OAuthエラーを除去し、`from=data`など安全な計測情報は残す。
- `data.pokefuta.com` からの遷移はクロスドメインリンカーを正とし、内部UTMは付けない。`from=data` を `source_app=tracker` と `p_data_referral` で計測する。
- `/about` を `pokefuta.com` と `data.pokefuta.com` 共通のAbout・お問い合わせページの正本とする。両ドメインを「姉妹サイト」と表現せず、同じサービス内の「ポケふた写真館」と「ポケふた図鑑」として扱う。運営者名は `nishiokya` と表記する。
- AdSenseのサイト登録は `pokefuta.com`、パブリッシャーIDは `pub-6885302916426075`。ルートの `public/ads.txt` と所有確認metaを維持する。広告枠は当初 `data.pokefuta.com` の都道府県・詳細ページだけに置き、写真館には置かない。
- イベント発生箇所は `surface` で表す。GA4の流入元予約語 `source` をカスタムイベント引数に使わない。
- エラーイベントは `p_api_error` / `p_auth_error` / `p_app_error` を使う。旧キーイベント名 `error_event` / `auth_error` は送信しない。

## 投稿ファネル

写真館の目的は投稿が積まれること。ファネルの計測はUXの指標であると同時に、
**投稿が全部落ちていることに気づく唯一の手段**なので、片方のフローだけ計測する状態を作らない。

イベント名の台帳は `SUBMISSION_FUNNEL_EVENTS`（`src/lib/analytics/gtag.ts`）。
`tools/check-ga4-contract.js` が台帳・両フローの網羅・ブロックの3軸（理由 × 位置 × 分類）・
系統ごとの理由表・`attempt_no` の付与を検査する（`npm run type-check` に同梱）。

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

### 数え方の約束（軸を混ぜない）

同じ人・同じ試行を別の軸で二度数えると、ファネルは静かに嘘をつく。次の3つを守る。

1. **到達1回の終端は `p_photo_upload_complete` か `p_submission_abandoned` のどちらか1つ** —
   完了していれば離脱は送らない。逆に完了しなかった到達は必ず離脱が出る（`pagehide` と
   アンマウントの両方を見ているため）。`p_submission_failed` は**試行の結果**であって
   到達の終端ではない — 失敗して再試行し完了した人は complete、失敗したまま去った人は
   `p_submission_abandoned{last_step:'failed'}` に出る。両方を「終端」として足さない。
2. **送信した試行は閉じる** —
   `p_photo_upload_start` = `p_photo_upload_complete` + `p_submission_failed` + `p_submission_blocked{block_phase:'postsend'}`。
   サーバーが差し戻したもの（409 の近接確認、503 の受付停止）は**障害ではない**ので失敗に混ぜず、
   代わりに `postsend` のブロックとして数える。この等式が合わないなら、どこかに送りっぱなしの経路がある。
3. **詰まりの件数は `is_repeat:false` で数える** — 生の件数は再試行のたびに増える。
   写真を選び直すと数え直す（別の写真で同じ壁に当たったのは、再試行の重複ではない）。
   **これは件数であって人数ではない。** 1人が写真を選び直せば何件でも出る。
   人数を見たいなら探索の `総ユーザー数` を読む（GA4のユーザー識別に従う）。

ブロックは**3軸**で持つ。1つの軸に混ぜない。

| 軸 | パラメータ | 値 |
|---|---|---|
| なぜ止まったか | `block_reason` | `SUBMISSION_BLOCK_REASONS`（8種） |
| いつ止まったか | `block_phase` | `entry` / `photo` / `presend` / `postsend` |
| 誰が直すか | `block_class` | `photo` / `proximity` / `catalog` / `system` / `policy` |

- `block_class` は `SUBMISSION_BLOCK_CLASS_BY_REASON` から**自動で載る**。呼び出し側では指定しない。
  理由を足すと `Record` の型が落ちるので、分類漏れは起きない。
  helper は呼び出し側の値を**捨てて**台帳から載せ直す（`PokefutaEventParams` に索引シグネチャが
  あるため、型だけでは混入を止められない）。
- `block_phase` は**その利用者が実際に行き止まりに着いた位置**を書く。呼び出し箇所が
  ページのどこにあるかではない。例: 蓋の一覧の取得失敗は、一覧を待つ写真を既に選んでいれば
  `photo`、選んでいなければ `entry`。ここを固定値にすると、回線の速さだけで同じ利用者が
  2つの位置に割れる。
- 系統ごとに起きうる理由は `SUBMISSION_BLOCK_REASONS_BY_KIND` に宣言する。
  ゼロ件を見たときに「起きていない」のか「送っていない」のかを区別するため。
  宣言と実装のズレは `tools/check-ga4-contract.js` が落とす。
- 再送は `attempt_no`（`submitting()` ごとに +1、送信前は 0）。送信・完了・失敗に載せる。
- 失敗の分類は両系統とも `classifyClientSubmissionError`
  （`src/lib/analytics/submission-error.ts`）を使う。**ステータスがメッセージより優先**。
- `has_note` は「**利用者が任意で書いたか**」。自動生成される入力から導かない
  （キャラふたの `visitNote` は onDrop が EXIF から埋めるので常に true になる。
  対応するのは「ひとこと」= `visitComment` の方）。系統をまたいで比較する軸は、
  両側が同じ意味であることを確かめてから足す。
- **同じ失敗を2つのイベントで数えない。** 投稿の失敗は `p_submission_failed` だけ。
  `p_app_error` を併せて送らない（キャラふただけが送っていて、障害の規模が2倍に見えていた）。
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
   `submission_kind` / `block_reason` / `block_phase` / `block_class` / `is_repeat` / `attempt_no` /
   `error_code` / `error_type` / `stage` / `last_step` /
   `photo_source` / `review_status` / `surface` / `prefecture` / `page_type` / `is_logged_in` /
   `source_app` / `site_type` / `is_open` / `has_note`
   （`attempt_no` は件数ではなく「何回目か」で分解したいのでディメンション。
   `is_repeat` は真偽値だが GA4 は文字列として受けるのでディメンションで登録する）
   （`is_open` / `has_note` は `p_go_friend_saved` の設定率・公開率を分けて見るため。
   真偽値だが GA4 は文字列として受けるのでディメンションで登録する）
2. カスタム指標:
   - `upload_duration_ms`、`dwell_ms`（いずれもミリ秒）
   - `manhole_loaded`、`manhole_total`（件数・標準）
     — 蓋の一覧が切り捨てられたときの規模を見るため。
     `p_app_error{error_code:'manhole_list_truncated' | 'manhole_list_total_invalid'}` に載る
3. キーイベント: `p_photo_upload_complete`（主要コンバージョン）、`p_signup_complete`
4. 探索（目標到達プロセス）: ステップ 2 → 3 → 5 → 6a、内訳ディメンション `submission_kind`。
   離脱理由は `p_submission_blocked{is_repeat:false}` を `block_phase` × `block_class` で
   分解した経路データ探索を併設する（`block_reason` はその下の粒度）
5. カスタムインサイト（異常検知）: `p_photo_upload_complete` の日次件数が急減したらメール通知

## AdSense

AdSense はPVと検索流入の多い `data.pokefuta.com`（pokefuta-tracker）で先行する。
`pokefuta.com` への導入目的も収益最大化ではなく広告配信・計測の学習だが、
サイト本来の閲覧・投稿体験を損なわないことを優先し、当初は広告を掲載しない。

- 全画面広告、ビネット広告、画面固定アンカー広告は使わない。
- 広告掲載は `data.pokefuta.com` の結果を見てから判断する。導入する場合もトップページには原則置かない。
- サイト確認と `ads.txt` は登録ホストの `pokefuta.com`（ルートの `public/ads.txt`）で配信し、デプロイ後に実サイトで確認する。
- 審査前にプライバシーポリシー、問い合わせ先、運営者情報が生きていることを確認する。
- 広告枠はレイアウトシフトを起こさないよう表示領域を予約し、Core Web Vitalsへの影響を確認する。
- GA4の既存イベント、クロスドメイン計測、同意・プライバシー方針を壊さない。
- Googleアカウントへのログイン、氏名・住所・支払い情報の入力、規約同意、審査リクエストの
  最終操作はユーザー本人が行う。そこまで進んだら作業を止め、必要な操作を具体的に案内する。
