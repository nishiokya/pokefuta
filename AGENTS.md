# Repository guidance

- Treat `app_user` profile data as public only through narrowly scoped `SECURITY DEFINER` functions. Do not grant anonymous table access.
- Keep `src/types/database.ts` in sync when a database migration adds or changes profile fields.
- A user may edit only the profile associated with `auth.uid()`; enforce this in the database as well as in the UI.
- GA4 は `pokefuta.com` / `www.pokefuta.com` だけで送信する。`localhost`、プレビューURL、開発端末名からは送らない。
- ページ表示は標準の `page_view` を使い、OAuthコードなどを含むクエリ文字列は `page_location` に送らない。
- イベント発生箇所は `surface` で表す。GA4の流入元予約語 `source` をカスタムイベント引数に使わない。
- エラーイベントは `p_api_error` / `p_auth_error` / `p_app_error` を使う。旧キーイベント名 `error_event` / `auth_error` は送信しない。
