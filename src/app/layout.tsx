import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import './globals.css';
import DevDebugPanel from '@/components/DevDebugPanel';

import { SITE_NAME, OGP_IMAGE_URL } from '@/lib/constants';

const inter = Inter({ subsets: ['latin'] });

const SITE_DESCRIPTION = '旅先で見つけたポケふたを記録しよう。訪問記録・写真投稿・スタンプ帳サービスです。';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  icons: {
    apple: '/icon-192.png',
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
    url: 'https://pokefuta.com',
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
    <html lang="ja">
      <head>
        {/* Google Analytics 4 - 環境変数がある場合のみ読み込み */}
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', ${JSON.stringify(gaId)}, { send_page_view: false });
                `,
              }}
            />
          </>
        )}
        {/* End Google Analytics 4 */}

        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ポケふた" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <div id="app" className="min-h-screen bg-[#F6EEDC]">
          {children}
          <DevDebugPanel />
        </div>
      </body>
    </html>
  );
}
