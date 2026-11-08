# デザインマンホールだけの投稿者プロフィール

対象: `/design-manholes/ae95834b-f4c3-41c4-b88e-2dd0ecaf3e34`。
公開HTMLに投稿者名はあるがトレーナーカードがなく、匿名RPC `get_design_manhole_submitter_public_id` は200/nullだった。

既存RPCは `get_public_user_ids` に委ねていたが、こちらは公開訪問・公開訪問へのコメント・蓋コメントだけを対象とし、デザインマンホールの投稿を含まない。
詳細専用RPCを、published の投稿から app_user の公開IDを返す形に変更。既に公開プロフィールRPCは訪問0件を許容している。
共通のユーザー検索、公開プロフィールの項目・編集権限、プロフィールテーブルの匿名権限は変更しない。

## 検証

- `node --experimental-strip-types --test tests/design-manhole-submitter-policy.test.ts`: 3件成功。
- 一時PGlite DBで新マイグレーションを実行（最小の app_user/design_manhole テーブルと匿名・認証済み・service_role ロールを用意）。本番DBへの書き込みなし。
- 3ロール × 6状態（published / hidden / needs_review / created_byなし / app_userなし / 投稿なし）=18件成功。
- anon の app_user・design_manhole 直接SELECTは拒否。published→hidden 後は即NULL。
- 同じマイグレーションの再実行も成功。
- アプリの変更はコメントのみのためビルドは未実行。完全なSupabaseスタック上での検証ではない。

## 本番反映

`20261109090000_design_manhole_submitter_profile.sql` の本番DB適用が必要。PR作成時点では未適用。
既存の force-dynamic/no-store の詳細ページがRPCを呼ぶため、SQL適用後に新しい画面実装は不要。
適用後は対象ページで投稿者名のスタンプ帳リンクと「投稿したトレーナー」カードを確認する。
