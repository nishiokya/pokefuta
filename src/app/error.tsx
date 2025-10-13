'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Camera, Navigation, History, Home, AlertCircle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Error occurred:', error);
  }, [error]);

  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark flex items-center justify-center p-4 pb-20">
      <div className="w-full max-w-md">
        {/* Pokemon Manhole Icon - Error State */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <div className="w-32 h-32 bg-gradient-to-br from-rpg-red to-rpg-bgDark border-4 border-rpg-border flex items-center justify-center mx-auto relative overflow-hidden">
              {/* Stylized Pokeball/Manhole design - Broken */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-4 border-white bg-rpg-red relative opacity-70">
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-white"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-4 border-white bg-rpg-bgDark"></div>
                  {/* Crack effect */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-1 bg-rpg-bgDark transform rotate-45"></div>
                  </div>
                </div>
              </div>
              {/* Error symbol */}
              <AlertCircle className="absolute w-12 h-12 text-rpg-yellow animate-pulse" />
            </div>
          </div>
          <h1 className="font-pixelJp text-4xl text-rpg-red mb-2" style={{
            textShadow: '4px 4px 0 #34495E'
          }}>
            エラー
          </h1>
          <p className="font-pixelJp text-xl text-rpg-textDark opacity-90 mb-2">
            問題が発生しました
          </p>
          <p className="font-pixelJp text-sm text-rpg-textDark opacity-70">
            ポケふたの冒険中に不具合が起きました...
          </p>
        </div>

        {/* Error Details Box */}
        <div className="rpg-window mb-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-rpg-red flex-shrink-0 mt-1" />
            <div className="flex-1">
              <p className="font-pixelJp text-sm text-rpg-textDark mb-3">
                予期しないエラーが発生しました。
                もう一度お試しいただくか、ホームに戻ってください。
              </p>
              {process.env.NODE_ENV === 'development' && error.message && (
                <div className="mt-3 p-2 bg-rpg-bgDark border-2 border-rpg-border">
                  <p className="font-mono text-xs text-rpg-red break-all">
                    {error.message}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={reset}
              className="rpg-button rpg-button-primary w-full text-center flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="font-pixelJp">もう一度試す</span>
            </button>
            <Link href="/" className="rpg-button w-full text-center block">
              <span className="font-pixelJp">ホームに戻る</span>
            </Link>
          </div>
        </div>

        {/* Suggestions */}
        <div className="rpg-window">
          <h3 className="font-pixelJp text-sm text-rpg-textDark font-bold mb-3">
            こちらもおすすめ
          </h3>
          <div className="space-y-2">
            <Link href="/map" className="flex items-center gap-2 p-2 hover:bg-rpg-bgLight transition-colors">
              <MapPin className="w-4 h-4 text-rpg-blue" />
              <span className="font-pixelJp text-xs text-rpg-textDark">マップを見る</span>
            </Link>
            <Link href="/nearby" className="flex items-center gap-2 p-2 hover:bg-rpg-bgLight transition-colors">
              <Navigation className="w-4 h-4 text-rpg-blue" />
              <span className="font-pixelJp text-xs text-rpg-textDark">近くのポケふたを探す</span>
            </Link>
            <Link href="/visits" className="flex items-center gap-2 p-2 hover:bg-rpg-bgLight transition-colors">
              <History className="w-4 h-4 text-rpg-yellow" />
              <span className="font-pixelJp text-xs text-rpg-textDark">訪問履歴を見る</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Navigation - RPG Style */}
      <nav className="nav-rpg">
        <div className="flex justify-around items-center max-w-md mx-auto py-2">
          <Link href="/" className="nav-rpg-item">
            <Home className="w-6 h-6 mb-1" />
            <span>ホーム</span>
          </Link>
          <Link href="/map" className="nav-rpg-item">
            <MapPin className="w-6 h-6 mb-1" />
            <span>マップ</span>
          </Link>
          <Link href="/nearby" className="nav-rpg-item">
            <Navigation className="w-6 h-6 mb-1" />
            <span>近く</span>
          </Link>
          <Link href="/upload" className="nav-rpg-item">
            <Camera className="w-6 h-6 mb-1" />
            <span>登録</span>
          </Link>
          <Link href="/visits" className="nav-rpg-item">
            <History className="w-6 h-6 mb-1" />
            <span>履歴</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
