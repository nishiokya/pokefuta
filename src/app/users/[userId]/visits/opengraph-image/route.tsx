import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getOgpFontPath } from '@/lib/pokefuta-ogp-template';
import { deriveSmallKey, storage } from '@/lib/storage';
import { getProgressClient, loadPublicUserPrefectureProgress } from '@/lib/user-prefecture-progress';
import { PublicVisit, loadPublicUserVisits } from '@/lib/user-public-visits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'ポケふたスタンプ帳';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// コラージュの配置スロット。写真は最大この数まで載る
const PHOTO_PLACEMENTS = [
  { top: 24, left: 60, rotate: '-6deg' },
  { top: 180, left: 130, rotate: '5deg' },
  { top: 320, left: 40, rotate: '-3deg' },
] as const;
const PHOTO_COUNT = PHOTO_PLACEMENTS.length;
// satori は1倍でラスタライズするので描画サイズちょうどでよい
const PHOTO_RENDER_SIZE = 230;
const PHOTO_FETCH_TIMEOUT_MS = 4000;

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
    const font = await readFile(getOgpFontPath());
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

  if (error || !data) {
    if (error) console.error('[OGP] users visits photo select failed:', error.message);
    return [];
  }

  const keyById = new Map(
    (data as unknown as PhotoKeyRow[]).map((row) => [row.id, row.storage_key])
  );

  // 署名は手元で完結する軽い処理なので、exists() の HEAD を打たずに
  // small を先に取りに行き、無ければ原本にフォールバックする
  const fetchPhoto = async (key: string): Promise<Response | null> => {
    const signed = await storage.getSignedUrl(key, 300);
    const response = await fetch(signed.url, {
      signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS),
    });
    return response.ok ? response : null;
  };

  const results = await Promise.all(
    photoIds.map(async (photoId) => {
      try {
        const storageKey = keyById.get(photoId);
        if (!storageKey) return null;

        const smallKey = deriveSmallKey(storageKey);
        let response = smallKey ? await fetchPhoto(smallKey).catch(() => null) : null;
        if (!response) {
          response = await fetchPhoto(storageKey);
        }
        if (!response) return null;

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

    if (!fontData) {
      // フォントなしで satori に CJK を渡すと描画時に throw して 500 になるだけなので、
      // 原因がわかる形で早期に落とす
      console.error('[OGP] users visits: CJK font is missing, cannot render');
      return new Response('Font unavailable', {
        status: 500,
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    const photoUris = await loadRecentPhotoDataUris(visitsData.visits).catch(() => []);

    const totalPrefectures = progress?.totalPrefectureCount || 47;
    const completionRate = progress ? Math.min(progress.completionRate, 100) : null;
    // 0% のときに 1.5% 埋まって見えないよう、進捗があるときだけ最小幅を適用
    const barWidthPercent = completionRate ? Math.max(completionRate, 1.5) : 0;

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
                        width: `${barWidthPercent}%`,
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
                const place = PHOTO_PLACEMENTS[index];
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
