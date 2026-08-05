# Repository guidance

- Treat `app_user` profile data as public only through narrowly scoped `SECURITY DEFINER` functions. Do not grant anonymous table access.
- Keep `src/types/database.ts` in sync when a database migration adds or changes profile fields.
- A user may edit only the profile associated with `auth.uid()`; enforce this in the database as well as in the UI.
- GA4 は `pokefuta.com` / `www.pokefuta.com` だけで送信する。`localhost`、プレビューURL、開発端末名からは送らない。
- ページ表示は標準の `page_view` を1回だけ送る。`page_location` は `code`・token・OAuthエラーを除去し、`from=data`など安全な計測情報は残す。
- `data.pokefuta.com` からの遷移はクロスドメインリンカーを正とし、内部UTMは付けない。`from=data` を `source_app=tracker` と `p_data_referral` で計測する。
- イベント発生箇所は `surface` で表す。GA4の流入元予約語 `source` をカスタムイベント引数に使わない。
- エラーイベントは `p_api_error` / `p_auth_error` / `p_app_error` を使う。旧キーイベント名 `error_event` / `auth_error` は送信しない。
