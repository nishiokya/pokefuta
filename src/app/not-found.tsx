'use client';

import Link from 'next/link';
import { MapPin, Camera, Navigation, History, Home, AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark flex items-center justify-center p-4 pb-20">
      <div className="w-full max-w-md">
        {/* Pokemon Manhole Icon */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <div className="w-32 h-32 bg-gradient-to-br from-rpg-yellow to-rpg-red border-4 border-rpg-border flex items-center justify-center mx-auto relative overflow-hidden">
              {/* Stylized Pokeball/Manhole design */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-4 border-white bg-rpg-red relative">
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-white"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-4 border-white bg-rpg-bgDark"></div>
                </div>
              </div>
            </div>
          </div>
          <h1 className="font-pixelJp text-4xl text-rpg-yellow mb-2" style={{
            textShadow: '4px 4px 0 #34495E'
          }}>
            404
          </h1>
          <p className="font-pixelJp text-xl text-rpg-textDark opacity-90 mb-2">
            ページが見つかりません
          </p>
          <p className="font-pixelJp text-sm text-rpg-textDark opacity-70">
            このポケふたは存在しないようです...
          </p>
        </div>

        {/* Error Message Box */}
        <div className="rpg-window mb-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-rpg-yellow flex-shrink-0 mt-1" />
            <div className="flex-1">
              <p className="font-pixelJp text-sm text-rpg-textDark mb-3">
                お探しのページは見つかりませんでした。
                URLが間違っているか、ページが削除された可能性があります。
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Link href="/" className="rpg-button rpg-button-primary w-full text-center block">
              <span className="font-pixelJp">ホームに戻る</span>
            </Link>
            <Link href="/map" className="rpg-button w-full text-center block">
              <span className="font-pixelJp">マップを見る</span>
            </Link>
          </div>
        </div>

        {/* Suggestions */}
        <div className="rpg-window">
          <h3 className="font-pixelJp text-sm text-rpg-textDark font-bold mb-3">
            こちらもおすすめ
          </h3>
          <div className="space-y-2">
            <Link href="/nearby" className="flex items-center gap-2 p-2 hover:bg-rpg-bgLight transition-colors">
              <Navigation className="w-4 h-4 text-rpg-blue" />
              <span className="font-pixelJp text-xs text-rpg-textDark">近くのポケふたを探す</span>
            </Link>
            <Link href="/upload" className="flex items-center gap-2 p-2 hover:bg-rpg-bgLight transition-colors">
              <Camera className="w-4 h-4 text-rpg-green" />
              <span className="font-pixelJp text-xs text-rpg-textDark">写真を登録する</span>
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
