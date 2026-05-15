'use client';

import { Camera, CheckCircle2, CircleDot, MapPin, Stamp, TrendingUp } from 'lucide-react';

interface PassportPreviewProps {
  onLoginClick: () => void;
}

export default function PassportPreview({ onLoginClick }: PassportPreviewProps) {
  return (
    <div className="space-y-4 mb-6">
      {/* メインメッセージ */}
      <div className="rpg-window text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative">
          <div className="inline-block mb-3">
            <div className="w-16 h-16 bg-[#F8D9C4] border-2 border-[#B5483C]/30 rounded-lg flex items-center justify-center mx-auto animate-bounce">
              <CircleDot className="w-10 h-10 text-[#B5483C]" />
            </div>
          </div>
          <h2 className="font-pixelJp text-xl font-bold text-[#4F3828] mb-2">
            あなた専用のポケふた旅ノート
          </h2>
          <p className="font-pixelJp text-sm text-[#6A4D36] leading-relaxed max-w-md mx-auto">
            訪問したポケふたをスタンプ帳に記録して、<br />
            自分だけの冒険の軌跡を残そう
          </p>
        </div>
      </div>

      {/* プレビューカード群 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* スタンプコレクション */}
        <div className="rpg-window">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-[#D94D3F] rounded-md flex items-center justify-center shrink-0">
              <Stamp className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-pixelJp text-sm font-bold text-[#4F3828] mb-1">
                スタンプを集める
              </h3>
              <p className="font-pixelJp text-xs text-[#6A4D36] leading-relaxed">
                訪問したポケふたがスタンプとして記録されます
              </p>
            </div>
          </div>
          {/* サンプルスタンプ */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 1, image: '/data/305_latest.jpeg' },
              { id: 2, image: '/data/404_latest.jpeg' },
              { id: 3, image: null }
            ].map((stamp) => (
              <div
                key={stamp.id}
                className="aspect-square rounded-lg border-2 border-[#B5483C]/45 bg-[#FFF7E5] p-2 flex items-center justify-center"
              >
                <div className="relative h-16 w-16 overflow-hidden rounded-full border-4 border-[#D94D3F] bg-[#E9DEC9] shadow-[inset_0_2px_8px_rgba(181,72,60,0.18)]">
                  {stamp.image ? (
                    <img
                      src={stamp.image}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle,#6F6658_0_18%,#B9AA91_19%_29%,#6F6658_30%_33%,#D7C9AF_34%_48%,#8B7D67_49%_52%,#CFC0A5_53%)]">
                      <CircleDot className="h-6 w-6 text-[#4F3828]/70" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 達成率トラッキング */}
        <div className="rpg-window">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-[#F1B642] rounded-md flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-[#4F3828]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-pixelJp text-sm font-bold text-[#4F3828] mb-1">
                達成率を見る
              </h3>
              <p className="font-pixelJp text-xs text-[#6A4D36] leading-relaxed">
                都道府県別の進捗や達成バッジがもらえます
              </p>
            </div>
          </div>
          {/* サンプル進捗バー */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-pixelJp text-[#4F3828] font-bold">東京都</span>
              <span className="font-pixel text-[#B5483C]">12/45</span>
            </div>
            <div className="h-3 overflow-hidden rounded-sm border border-[#8C6A4A]/25 bg-[#E4D4B8]">
              <div className="h-full rounded-sm bg-gradient-to-r from-[#D94D3F] to-[#F1B642] transition-all" style={{ width: '26%' }} />
            </div>
          </div>
        </div>

        {/* 写真で記録 */}
        <div className="rpg-window">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-[#3F9D7D] rounded-md flex items-center justify-center shrink-0">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-pixelJp text-sm font-bold text-[#4F3828] mb-1">
                写真で記録
              </h3>
              <p className="font-pixelJp text-xs text-[#6A4D36] leading-relaxed">
                訪問時の写真やメモを残せます
              </p>
            </div>
          </div>
          {/* サンプル写真グリッド */}
          <div className="grid grid-cols-2 gap-1">
            {[
              { id: 1, image: '/data/305_latest.jpeg' },
              { id: 2, image: '/data/404_latest.jpeg' }
            ].map((photo) => (
              <div
                key={photo.id}
                className="aspect-square rounded-md border border-[#8C6A4A]/15 bg-[#E9DEC9] overflow-hidden"
              >
                <img
                  src={photo.image}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 訪問地を追跡 */}
        <div className="rpg-window">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-[#7B63A8] rounded-md flex items-center justify-center shrink-0">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-pixelJp text-sm font-bold text-[#4F3828] mb-1">
                訪問地を追跡
              </h3>
              <p className="font-pixelJp text-xs text-[#6A4D36] leading-relaxed">
                どこに行ったか、いつ行ったかが一目でわかります
              </p>
            </div>
          </div>
          {/* サンプル訪問リスト */}
          <div className="space-y-1">
            {['横浜市', '渋谷区', '千代田区'].map((city, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-xs bg-white/55 rounded-md border border-[#8C6A4A]/15 px-2 py-1"
              >
                <CheckCircle2 className="w-3 h-3 text-[#3F9D7D] shrink-0" />
                <span className="font-pixelJp text-[#4F3828]">{city}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="rpg-window text-center bg-gradient-to-b from-[#FFF7E5] to-[#F8D9C4]">
        <p className="font-pixelJp text-sm text-[#6A4D36] mb-4 leading-relaxed">
          これらの機能は<span className="font-bold text-[#B5483C]">ログイン後</span>にご利用いただけます
        </p>
        <button
          onClick={onLoginClick}
          className="w-full rpg-button rpg-button-primary py-3 text-base"
        >
          <span className="font-pixelJp font-bold">ログインして旅ノートを始める</span>
        </button>
        <p className="font-pixelJp text-xs text-[#8C6A4A] mt-3">
          無料で始められます
        </p>
      </div>
    </div>
  );
}
