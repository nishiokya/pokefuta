import type { Metadata, Viewport } from 'next';
import { Inter, M_PLUS_Rounded_1c } from 'next/font/google';
import './site-chrome-tokens.css';
import './globals.css';
import DevDebugPanel from '@/components/DevDebugPanel';
import ApiErrorAnalytics from '@/components/ApiErrorAnalytics';
import SiteChrome from '@/components/SiteChrome';
import GoogleAnalytics from '@/components/GoogleAnalytics';

import { SITE_NAME, SITE_URL, OGP_IMAGE_URL } from '@/lib/constants';

const inter = Inter({ subsets: ['latin'] });

// ヘッダー・下タブ（SiteChrome）専用。図鑑の site-header.css と同じ書体・太さを読み込む。
// globals.css の @import は @tailwind より後ろにあるためブラウザに無視されており、
// これが無いとクロムの文字がヒラギノ等に置き換わって図鑑より大きく太く見える。
// 本文には当てない（variable は --font-chrome を定義するだけ）。
const chromeFont = M_PLUS_Rounded_1c({
  // この書体に 600 は無く、図鑑でも 600 指定は 700 で描かれる。同じになるよう 700/800 だけ
  weight: ['700', '800'],
  subsets: ['latin'],
  preload: false,
  display: 'swap',
  variable: '--font-chrome',
});

const SITE_DESCRIPTION = '旅先で見つけたポケふたを記録しよう。訪問記録・写真投稿・スタンプ帳サービスです。';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/brand-icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
      { url: '/favicon-96.png', type: 'image/png', sizes: '96x96' },
    ],
    apple: '/apple-touch-icon.png',
  },
  keywords: ['ポケモン', 'ポケふた', 'マンホール', '訪問記録', '写真', 'スタンプ帳'],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: OGP_IMAGE_URL, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OGP_IMAGE_URL],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ff6b6b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ==========================================
  // Google Analytics 4 ID
  // ==========================================
  // 環境変数から GA ID を取得
  // キー: NEXT_PUBLIC_GA_ID（本番環境 (Amplify) でのみ設定）
  // Local dev では計測しない（環境変数がない場合）
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="ja" className={chromeFont.variable}>
      <head>
        <meta name="google-adsense-account" content="ca-pub-6885302916426075" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ポケふた" />
      </head>
      <body className={`${inter.className} antialiased`}>
        {gaId && <GoogleAnalytics measurementId={gaId} />}
        <div id="app" className="min-h-screen bg-[#F6EEDC]">
          <ApiErrorAnalytics />
          {/* ヘッダー・下タブはここが唯一の描画箇所。ページ側には書かない */}
          <SiteChrome>{children}</SiteChrome>
          <DevDebugPanel />
        </div>
      </body>
    </html>
  );
}
