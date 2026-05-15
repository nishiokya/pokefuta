import { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pokefuta.example.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',           // APIエンドポイント
          '/upload',         // アップロードページ（認証が必要）
          '/visits',         // 個人の訪問記録（認証が必要）
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
