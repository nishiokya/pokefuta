import { MetadataRoute } from 'next';

const baseUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://pokefuta.com'
).replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',           // APIエンドポイント
          '/api-docs',       // 開発環境向けAPIドキュメント
          '/login',          // 認証ページ
          '/signup',         // 認証ページ
          '/upload',         // アップロードページ（認証が必要）
          '/visits',         // 個人の訪問記録（認証が必要）
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
