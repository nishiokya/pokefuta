// トップの特集カード（/api/features/*）の Cache-Control。
// 雪・ぬいぐるみの判定は毎朝の自動採点で書かれるので、CDN に1時間、ブラウザに10分置いてよい。
// 期限切れのあとも1日は古い応答を返しながら裏で取り直す（SSR の起動待ちを利用者に見せない）。
// 中身は anon で読む公開データだけ（クッキーを読むクライアントを作らない）
export const FEATURE_CARD_CACHE_CONTROL = 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400';
