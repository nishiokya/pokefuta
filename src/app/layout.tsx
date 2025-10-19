import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import DevDebugPanel from '@/components/DevDebugPanel';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ポケふた訪問記録',
  description: 'ポケモンマンホール（ポケふた）の訪問記録と写真を管理するアプリ',
  manifest: '/manifest.json',
  icons: {
    apple: '/icon-192.png',
  },
  keywords: ['ポケモン', 'ポケふた', 'マンホール', '訪問記録', '写真'],
  authors: [{ name: 'ポケふた訪問記録 開発チーム' }],
  creator: 'ポケふた訪問記録',
  publisher: 'ポケふた訪問記録',
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
        {/* Google Analytics 4 */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-K18NR4GZG2"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-K18NR4GZG2');
            `,
          }}
        />
        {/* End Google Analytics 4 */}

        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ポケふた" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <div id="app" className="min-h-screen bg-gradient-to-br from-pokemon-red via-pokemon-blue to-pokemon-yellow">
          {children}
          <DevDebugPanel />
        </div>
      </body>
    </html>
  );
}