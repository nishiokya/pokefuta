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
      '/manhole/[id]/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/pokefuta_ogp_background_1200x630.png',
      ],
      '/share/photo/[photoId]/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/pokefuta_ogp_background_1200x630.png',
      ],
      '/p/[photoId]/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
        './public/ogp/pokefuta_ogp_template.svg',
        './public/ogp/pokefuta_ogp_background_1200x630.png',
      ],
      '/users/[userId]/prefectures/opengraph-image': [
        './public/ogp/fonts/NotoSansCJKjp-Bold.otf',
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
    ],
    formats: ['image/webp', 'image/avif'],
  },
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
