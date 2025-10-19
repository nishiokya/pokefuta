import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import DevDebugPanel from '@/components/DevDebugPanel';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ポケふた写真トラッカー',
  description: 'ポケふたの訪問記録と写真を管理するアプリ',
  manifest: '/manifest.json',
  icons: {
    apple: '/icon-192.png',
  },
  keywords: ['ポケモン', 'ポケふた', '写真', '旅行', '記録'],
  authors: [{ name: 'ポケふたトラッカー開発チーム' }],
  creator: 'ポケふたトラッカー',
  publisher: 'ポケふたトラッカー',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
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
  return (
    <html lang="ja">
      <head>
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MQLBTG83');`,
          }}
        />
        {/* End Google Tag Manager */}

        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ポケふた" />
      </head>
      <body className={`${inter.className} antialiased`}>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MQLBTG83"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}

        <div id="app" className="min-h-screen bg-gradient-to-br from-pokemon-red via-pokemon-blue to-pokemon-yellow">
          {children}
          <DevDebugPanel />
        </div>
      </body>
    </html>
  );
}