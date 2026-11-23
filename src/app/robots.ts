import { MetadataRoute } from 'next';

const baseUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://pokefuta.com'
).replace(/\/$/, '');

const commonDisallow = [
  '/api/',           // APIエンドポイント
  '/login',          // 認証ページ
  '/upload',         // アップロードページ（認証が必要）
  '/visits',         // 個人の訪問記録（認証が必要）
];

// AI の学習用クローラーには写真の個別ページ（/p/）を読ませない。
// 2026-11-23 17:30〜18:30 JST に GPTBot と ClaudeBot が /p/ を約6,000回（2,518ページ）読み、
// 1ページあたり Supabase へ4〜5本のリクエストが出て Egress が跳ねた。
// robots.txt では UA ごとのグループがあると '*' のグループは使われないので、共通の禁止もここに並べる。
// 検索用の OAI-SearchBot・Claude-SearchBot、ユーザー操作の ChatGPT-User・Claude-User は対象外。
const aiTrainingCrawlers = ['GPTBot', 'ClaudeBot'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: commonDisallow,
      },
      {
        userAgent: aiTrainingCrawlers,
        allow: '/',
        disallow: [...commonDisallow, '/p/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
