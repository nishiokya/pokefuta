import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPublicUserPrefectureProgress } from '@/lib/user-prefecture-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'ポケふた都道府県達成状況';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type RouteContext = {
  params: {
    userId: string;
  };
};

async function loadNotoSansCjk(): Promise<ArrayBuffer | null> {
  try {
    const fontPath = join(process.cwd(), 'public/ogp/fonts/NotoSansCJKjp-Bold.otf');
    const font = await readFile(fontPath);
    return new Uint8Array(font).buffer;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const [progress, fontData] = await Promise.all([
    loadPublicUserPrefectureProgress(params.userId),
    loadNotoSansCjk(),
  ]);

  if (!progress) {
    return new Response('Not found', { status: 404 });
  }

  const completionRate = `${progress.completionRate.toFixed(1)}%`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#F6EEDC',
          color: '#4F3828',
          padding: 56,
          fontFamily: 'NotoSansCJK, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(90deg, rgba(140,106,74,0.10) 1px, transparent 1px), linear-gradient(rgba(140,106,74,0.10) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 32,
            border: '4px solid rgba(140,106,74,0.18)',
            borderRadius: 20,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, zIndex: 1 }}>
          <div
            style={{
              display: 'flex',
              width: 'fit-content',
              borderRadius: 999,
              background: '#F8D9C4',
              color: '#B5483C',
              padding: '10px 20px',
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            ポケふた都道府県達成状況
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1.1 }}>
            {progress.displayName}のポケふた旅
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, zIndex: 1 }}>
          <OgpStat label="制覇都道府県" value={`${progress.completedPrefectureCount}/${progress.totalPrefectureCount}`} />
          <OgpStat label="公開訪問スタンプ" value={`${progress.visitedManholeCount}/${progress.totalManholeCount}`} />
          <OgpStat label="全国達成率" value={completionRate} />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [
            {
              name: 'NotoSansCJK',
              data: fontData,
              weight: 700,
            },
          ]
        : [],
    }
  );
}

function OgpStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        border: '3px solid rgba(140,106,74,0.18)',
        borderRadius: 16,
        background: 'rgba(255,247,229,0.92)',
        padding: 24,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color: '#6A4D36' }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 54, fontWeight: 900, color: '#B5483C' }}>{value}</div>
    </div>
  );
}
