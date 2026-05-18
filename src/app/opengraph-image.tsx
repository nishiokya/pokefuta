import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ポケふたスタンプ帳';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4a7c59 0%, #2d5a3d 40%, #1a3a28 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 背景の格子模様（地図風） */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 60px)',
          }}
        />

        {/* 装飾: 左上の丸 */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: -80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
          }}
        />
        {/* 装飾: 右下の丸 */}
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            right: -60,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
          }}
        />

        {/* スタンプ枠風の装飾ボーダー */}
        <div
          style={{
            position: 'absolute',
            inset: 32,
            border: '3px dashed rgba(255,255,255,0.25)',
            borderRadius: 24,
          }}
        />

        {/* メインコンテンツ */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            zIndex: 1,
          }}
        >
          {/* アイコン（スタンプ風） */}
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              border: '4px solid rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
            }}
          >
            📍
          </div>

          {/* タイトル */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-2px',
              textShadow: '0 4px 20px rgba(0,0,0,0.4)',
              lineHeight: 1.1,
              textAlign: 'center',
            }}
          >
            ポケふたスタンプ帳
          </div>

          {/* サブテキスト */}
          <div
            style={{
              fontSize: 32,
              color: 'rgba(255,255,255,0.85)',
              textAlign: 'center',
              letterSpacing: '1px',
              textShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            旅先で見つけたポケふたを記録しよう
          </div>

          {/* タグ */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 8,
            }}
          >
            {['訪問記録', '写真投稿', 'スタンプ帳'].map((tag) => (
              <div
                key={tag}
                style={{
                  padding: '8px 20px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.35)',
                  color: '#ffffff',
                  fontSize: 22,
                  letterSpacing: '1px',
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 52,
            fontSize: 22,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '1px',
          }}
        >
          pokefuta.com
        </div>
      </div>
    ),
    { ...size }
  );
}
