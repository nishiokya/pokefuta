import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { deriveSmallKey, storage } from '@/lib/storage';
import { getProgressClient, loadPublicUserPrefectureProgress } from '@/lib/user-prefecture-progress';
import { PublicVisit, loadPublicUserVisits } from '@/lib/user-public-visits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'ポケふたスタンプ帳';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PHOTO_COUNT = 3;
const PHOTO_RENDER_SIZE = 420;

type RouteContext = {
  params: {
    userId: string;
  };
};

type PhotoKeyRow = {
  id: string;
  storage_key: string;
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

// 最新の公開訪問写真を最大3枚、data URI(JPEG)にして返す。
// 1枚でも失敗したら写真なしレイアウトに落とすのではなく、取れた分だけ使う。
async function loadRecentPhotoDataUris(visits: PublicVisit[]): Promise<string[]> {
  const photoIds = visits
    .map((visit) => visit.photoIds[0])
    .filter((id): id is string => Boolean(id))
    .slice(0, PHOTO_COUNT);

  if (photoIds.length === 0) return [];

  const supabase = getProgressClient();
  if (!supabase) return [];

  // photoIds は公開訪問由来だが、直接クエリでも is_public を再確認して二重に守る
  const { data, error } = await supabase
    .from('photo')
    .select('id, storage_key, visit:visit_id!inner(is_public)')
    .in('id', photoIds)
    .eq('visit.is_public', true);

  if (error || !data) return [];

  const keyById = new Map(
    (data as unknown as PhotoKeyRow[]).map((row) => [row.id, row.storage_key])
  );

  const results = await Promise.all(
    photoIds.map(async (photoId) => {
      try {
        const storageKey = keyById.get(photoId);
        if (!storageKey) return null;

        let key = storageKey;
        const smallKey = deriveSmallKey(storageKey);
        if (smallKey && (await storage.exists?.(smallKey))) {
          key = smallKey;
        }

        const signed = await storage.getSignedUrl(key, 300);
        const response = await fetch(signed.url);
        if (!response.ok) return null;

        const input = Buffer.from(await response.arrayBuffer());
        const jpeg = await sharp(input)
          .rotate()
          .resize(PHOTO_RENDER_SIZE, PHOTO_RENDER_SIZE, { fit: 'cover' })
          .jpeg({ quality: 72 })
          .toBuffer();

        return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      } catch {
        return null;
      }
    })
  );

  return results.filter((uri): uri is string => Boolean(uri));
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const [visitsData, progress, fontData] = await Promise.all([
      loadPublicUserVisits(params.userId),
      loadPublicUserPrefectureProgress(params.userId).catch(() => null),
      loadNotoSansCjk(),
    ]);

    if (!visitsData) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    const photoUris = await loadRecentPhotoDataUris(visitsData.visits).catch(() => []);

    const totalPrefectures = progress?.totalPrefectureCount || 47;
    const completionRate = progress ? Math.min(progress.completionRate, 100) : null;

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            background: '#F6EEDC',
            color: '#4F3828',
            padding: 52,
            fontFamily: 'NotoSansCJK, sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0, right: 0, bottom: 0, left: 0,
              backgroundImage: 'linear-gradient(#8C6A4A1A 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 28, right: 28, bottom: 28, left: 28,
              border: '4px solid rgba(140,106,74,0.18)',
              borderRadius: 20,
            }}
          />

          {/* 左: 名前とスタッツ */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              flex: 1,
              paddingRight: 36,
              zIndex: 1,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignSelf: 'flex-start',
                  borderRadius: 999,
                  background: '#F8D9C4',
                  color: '#B5483C',
                  padding: '10px 20px',
                  fontSize: 26,
                  fontWeight: 800,
                }}
              >
                ポケふたスタンプ帳
              </div>
              <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.15 }}>
                {`${visitsData.displayName}のスタンプ帳`}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 20 }}>
                <OgpStat label="訪問スタンプ" value={`${visitsData.totalVisits}`} />
                <OgpStat
                  label="都道府県"
                  value={`${visitsData.prefectureCount}/${totalPrefectures}`}
                />
              </div>

              {completionRate !== null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 24,
                      fontWeight: 800,
                      color: '#6A4D36',
                    }}
                  >
                    <span>全国達成率</span>
                    <span style={{ color: '#B5483C' }}>{completionRate.toFixed(1)}%</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      width: '100%',
                      height: 22,
                      borderRadius: 999,
                      background: 'rgba(140,106,74,0.18)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        width: `${Math.max(completionRate, 1.5)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: '#B5483C',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右: 訪問写真コラージュ or スタンプモチーフ */}
          <div
            style={{
              display: 'flex',
              width: 400,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {photoUris.length > 0 ? (
              photoUris.map((uri, index) => {
                const placements = [
                  { top: 24, left: 60, rotate: '-6deg' },
                  { top: 180, left: 130, rotate: '5deg' },
                  { top: 320, left: 40, rotate: '-3deg' },
                ];
                const place = placements[index] ?? placements[0];
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={index}
                    src={uri}
                    alt=""
                    width={230}
                    height={230}
                    style={{
                      position: 'absolute',
                      top: place.top,
                      left: place.left,
                      width: 230,
                      height: 230,
                      objectFit: 'cover',
                      borderRadius: 16,
                      border: '8px solid #FFF7E5',
                      boxShadow: '0 14px 30px rgba(95,68,42,0.28)',
                      transform: `rotate(${place.rotate})`,
                    }}
                  />
                );
              })
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 300,
                  height: 300,
                  margin: 'auto',
                  borderRadius: 999,
                  border: '10px dashed rgba(181,72,60,0.45)',
                  color: '#B5483C',
                  fontSize: 40,
                  fontWeight: 900,
                  transform: 'rotate(-8deg)',
                }}
              >
                ポケふた旅
              </div>
            )}
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
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[OGP] users visits render failed:', err);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }
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
        padding: '20px 24px',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color: '#6A4D36' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 52, fontWeight: 900, color: '#B5483C' }}>{value}</div>
    </div>
  );
}
