/** @type {import('next').NextConfig} */
const path = require('path');

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'map-tiles',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60 * 30, // 30 days
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-api',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
      },
    },
  ],
});

const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
  experimental: {
    trustHost: true,
    serverComponentsExternalPackages: ['sharp'],
    outputFileTracingIncludes: {
      // サイト共通の OG 画像（layout の OGP_IMAGE_URL）。renderOgpFallback もテンプレート一式を読む
      '/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/manhole-photo-mosaic-left-600x630.webp',
      ],
      '/manhole/[id]/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/manhole-photo-mosaic-left-600x630.webp',
      ],
      '/share/photo/[photoId]/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/manhole-photo-mosaic-left-600x630.webp',
      ],
      '/p/[photoId]/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/manhole-photo-mosaic-left-600x630.webp',
      ],
      '/users/[userId]/prefectures/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
      ],
      // フォントに加えテンプレート一式を含める。renderCard() がテンプレートSVGと
      // 焼き込みモザイクを読むので、トレース対象から漏れると本番でカードが描けない。
      // tools/verify-ogp-linux.js がこの一覧とアセット名の一致を検査する。
      '/design-manholes/[id]/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/manhole-photo-mosaic-left-600x630.webp',
      ],
    },
  },
  // 画像最適化（/_next/image）は止める。next/image はどこでも使っておらず、写真は /api/photo と R2 から配る。
  // 生かしておくと、sharp（libheif）の RCE（GHSA-2xp9-vwfh-vxw4）や巨大画像の DoS を未認証で受ける入口になる。
  // 以前の remotePatterns は *.supabase.co のワイルドカードで、他人の Supabase プロジェクトの画像も取り込めた（2026-10-22）
  images: {
    unoptimized: true,
  },
  redirects: async () => [
    // www 付きは apex へまとめる。www でも 200 を返していて、Search Console で重複の扱いになっていた。
    // CloudFront のキャッシュは host ごとに分かれている（www で取っても apex は Miss）ので、
    // この転送が apex 側に混ざって転送が止まらなくなることはない。認証クッキーは .pokefuta.com
    // スコープなのでログインは切れない。クエリは Next.js が付けたまま送る
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'www.pokefuta.com' }],
      destination: 'https://pokefuta.com/:path*',
      permanent: true,
    },
    {
      source: '/signup',
      destination: '/login',
      permanent: true,
    },
    // 写真館の全国マップ・全国一覧は閉じて図鑑へ送る。どちらも図鑑に同じ役割のページがあり、
    // 写真館側は 90 日で /map 165・/manholes 66 ビューだった。/manholes?q= の検索語は図鑑に
    // 受け口が無い。クエリは付いたまま図鑑のトップへ行くが、図鑑側は読まない
    {
      source: '/map',
      destination: 'https://data.pokefuta.com/map',
      permanent: true,
    },
    {
      source: '/manholes',
      destination: 'https://data.pokefuta.com/',
      permanent: true,
    },
    // 開発用の Swagger UI（/api-docs）は撤去した。本番では元から中身が出ていなかった
    {
      source: '/api-docs',
      destination: '/',
      permanent: true,
    },
    // 人気のポケふた（/popular）は閉じた。30日で十数ビュー・検索流入なし、入口は公開スタンプ帳の
    // カード1枚だけだった。ブックマークやログイン後の戻り先を行き止まりにしないためトップへ送る
    {
      source: '/popular',
      destination: '/',
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: '/manifest.json',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/manifest+json',
        },
      ],
    },
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'on',
        },
        // HSTS は本番のみ。開発環境で送ると Chrome が localhost を https:// で開こうとして
        // dev server (http only) に接続できなくなる。
        ...(process.env.NODE_ENV === 'production' ? [{
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        }] : []),
        {
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Referrer-Policy',
          value: 'origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=*, microphone=(), geolocation=(self)',
        },
      ],
    },
  ],
};

module.exports = withPWA(nextConfig);
