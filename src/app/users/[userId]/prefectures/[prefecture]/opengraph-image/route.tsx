import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { getOgpFontPath } from '@/lib/pokefuta-ogp-template';
import { loadPublicUserPrefectureProgress } from '@/lib/user-prefecture-progress';
import { SITE_NAME } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'ポケふた都道府県バッジ';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type RouteContext = {
  params: {
    userId: string;
    prefecture: string;
  };
};

async function loadNotoSansCjk(): Promise<ArrayBuffer | null> {
  try {
    const font = await readFile(getOgpFontPath());
    return new Uint8Array(font).buffer;
  } catch {
    return null;
  }
}

function decodePrefectureParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const [progress, fontData] = await Promise.all([
      loadPublicUserPrefectureProgress(params.userId).catch(() => null),
      loadNotoSansCjk(),
    ]);

    const prefectureName = decodePrefectureParam(params.prefecture);
    const prefecture = progress?.prefectures.find((item) => item.name === prefectureName) ?? null;

    if (!progress || !prefecture) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (!fontData) {
      // フォントなしで satori に CJK を渡すと描画時に throw して 500 になるだけなので、
      // 原因がわかる形で早期に落とす
      console.error('[OGP] prefecture badge: CJK font is missing, cannot render');
      return new Response('Font unavailable', {
        status: 500,
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    // バッジは獲得済みかで描き分ける。制覇後の新設で進捗表示に戻さない
    const complete = Boolean(prefecture.earnedAt);
    const accent = complete ? '#C9992F' : '#B5483C';
    const barWidthPercent = prefecture.rate > 0 ? Math.max(prefecture.rate, 1.5) : 0;

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
            background: complete ? '#FDF3D8' : '#F6EEDC',
            color: '#4F3828',
            padding: 56,
            // 下端のブランド表記と中央のテキストが重ならないよう、その分だけ内容を上に寄せる
            paddingBottom: 120,
            fontFamily: 'NotoSansCJK, sans-serif',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 28, right: 28, bottom: 28, left: 28,
              border: `6px solid ${complete ? 'rgba(201,153,47,0.55)' : 'rgba(140,106,74,0.18)'}`,
              borderRadius: 24,
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 132,
              height: 132,
              // 親が flexDirection: column なので、指定しないと縦につぶれて楕円になる
              flexShrink: 0,
              borderRadius: 999,
              border: `8px solid ${accent}`,
              background: '#FFFBEE',
              color: accent,
              // 「100%」まで円内に収める必要があるので、★より小さい字送りにする
              fontSize: complete ? 62 : 42,
              fontWeight: 900,
              zIndex: 1,
            }}
          >
            {complete ? '★' : `${Math.round(prefecture.rate)}%`}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 26,
              borderRadius: 999,
              background: complete ? 'rgba(201,153,47,0.22)' : 'rgba(181,72,60,0.12)',
              color: complete ? '#8A6A1E' : '#B5483C',
              padding: '10px 24px',
              fontSize: 26,
              fontWeight: 800,
              zIndex: 1,
            }}
          >
            {complete ? '都道府県コンプリート' : `あと${prefecture.remaining}枚でコンプリート`}
          </div>

          {/* satori は複数の子ノードを持つ div に display 指定を要求するので、
              テキストは必ず1つの文字列に畳んでから渡す */}
          <div style={{ display: 'flex', marginTop: 18, fontSize: 76, fontWeight: 900, zIndex: 1 }}>
            {complete ? `${prefecture.name}制覇` : prefecture.name}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 8,
              fontSize: 60,
              fontWeight: 900,
              color: accent,
              zIndex: 1,
            }}
          >
            {complete
              ? `${prefecture.earnedTotal}/${prefecture.earnedTotal}`
              : `${prefecture.visited}/${prefecture.total}`}
          </div>

          {!complete && (
            <div
              style={{
                display: 'flex',
                width: 620,
                height: 22,
                marginTop: 22,
                borderRadius: 999,
                background: 'rgba(140,106,74,0.18)',
                overflow: 'hidden',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: `${barWidthPercent}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: accent,
                }}
              />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              marginTop: 30,
              fontSize: 30,
              fontWeight: 800,
              color: '#6A4D36',
              zIndex: 1,
            }}
          >
            {complete && prefecture.earnedAt
              ? `${progress.displayName} ・ ${new Intl.DateTimeFormat('ja-JP', {
                  timeZone: 'Asia/Tokyo',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(prefecture.earnedAt))} 制覇`
              : progress.displayName}
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: 52,
              right: 62,
              fontSize: 24,
              fontWeight: 800,
              color: '#8C6A4A',
              zIndex: 1,
            }}
          >
            {SITE_NAME}
          </div>
        </div>
      ),
      {
        ...size,
        fonts: [
          {
            name: 'NotoSansCJK',
            data: fontData,
            weight: 700 as const,
          },
        ],
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[OGP] prefecture badge render failed:', err);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }
}
