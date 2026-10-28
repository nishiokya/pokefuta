import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { sniffImageFormat } from '@/lib/image-sniff';
import { getOgpFontPath } from '@/lib/pokefuta-ogp-template';
import { deriveSmallKey, storage } from '@/lib/storage';
import {
  FALLBACK_INSTALLED_PREFECTURE_COUNT,
  getProgressClient,
  loadPublicUserPrefectureProgress,
} from '@/lib/user-prefecture-progress';
import { PublicVisit, loadPublicUserVisits } from '@/lib/user-public-visits';
import { SITE_NAME } from '@/lib/constants';
import { badgeRank, lidImageUrl } from '@/lib/badge-catalog';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import { fetchPokemonRepresentatives } from '@/lib/pokemon-representatives';
import { buildPublicStampbookBadges, type PublicStampbookBadges } from '@/lib/public-stampbook-badges';
import { fetchRegularBadges } from '@/lib/regular-badges';
import { rankRing } from '@/components/users/HeroStat';
import { titleProgress } from '@/components/users/title-progress';
import StampbookOgpCard, {
  OGP_MEDAL_COUNT,
  OGP_MEDAL_SIZE,
  OGP_PHOTO_COUNT,
  OGP_PHOTO_SIZE,
  type OgpMedal,
  type OgpStat,
} from './StampbookOgpCard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// satori は1倍でラスタライズするので描画サイズちょうどでよい
const PHOTO_RENDER_SIZE = OGP_PHOTO_SIZE;
const PHOTO_FETCH_TIMEOUT_MS = 4000;
// メダルの段のうち都道府県に使う数。残りをポケモンで埋める（どちらかが足りなければもう片方で埋める）
const PREFECTURE_MEDAL_SLOTS = 4;

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
    // このOGPは投稿単体ではなくスタンプ帳の代表画像。風景を蓋の代表に見せない。
    // 風景投稿そのものはプロフィール本文と写真単体共有でラベル付き表示を続ける。
    .filter((visit) => !visit.isLandscape)
    .map((visit) => visit.photoIds[0])
    .filter((id): id is string => Boolean(id))
    .slice(0, OGP_PHOTO_COUNT);

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
        // 保存済みの写真も利用者が送った画像。JPEG/PNG/WebP 以外は sharp に渡さず、その枠を飛ばす
        if (!sniffImageFormat(input)) return null;
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

// ポケモンのメダルに入れる蓋の切り抜き（data.pokefuta.com の静的画像）。取れなければ空の丸
async function loadLidDataUri(manholeId: number): Promise<string | null> {
  try {
    const response = await fetch(lidImageUrl(manholeId), { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const input = Buffer.from(await response.arrayBuffer());
    if (!sniffImageFormat(input)) return null;
    const size = OGP_MEDAL_SIZE - 16;
    const jpeg = await sharp(input).resize(size, size, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}

const rate = (visited: number, total: number) => (total > 0 ? Math.min((visited / total) * 100, 100) : 0);

// ページのバッジの棚と同じ並び（集めた順）から、都道府県とポケモンを合わせて OGP_MEDAL_COUNT 個
async function pickMedals(badges: PublicStampbookBadges): Promise<{ medals: OgpMedal[]; more: number }> {
  const prefSlots = Math.max(PREFECTURE_MEDAL_SLOTS, OGP_MEDAL_COUNT - badges.pokemon.length);
  const prefectures = badges.prefectures.slice(0, prefSlots);
  const pokemon = badges.pokemon.slice(0, OGP_MEDAL_COUNT - prefectures.length);
  const pokemonMedals = await Promise.all(
    pokemon.map(async (p): Promise<OgpMedal> => ({
      kind: 'pokemon',
      key: `pokemon-${p.name}`,
      image: p.manholeId !== undefined ? await loadLidDataUri(p.manholeId) : null,
      rank: badgeRank(p.visited, p.total),
      rate: rate(p.visited, p.total),
    }))
  );
  const medals: OgpMedal[] = [
    ...prefectures.map((p): OgpMedal => ({
      kind: 'prefecture',
      key: `prefecture-${p.name}`,
      label: p.label,
      rank: p.rank,
      rate: rate(p.visited, p.total),
    })),
    ...pokemonMedals,
  ];
  return { medals, more: badges.prefectures.length + badges.pokemon.length - medals.length };
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const [visitsData, progress, fontData, snapshot, representatives, regularBadges] = await Promise.all([
      loadPublicUserVisits(params.userId),
      loadPublicUserPrefectureProgress(params.userId).catch(() => null),
      loadNotoSansCjk(),
      // ステッカーの判定に蓋のテーマ（hashtags）が要る。スナップショットは1時間キャッシュされる
      fetchManholeSnapshot().catch(() => null),
      fetchPokemonRepresentatives(),
      // 称号は飾りなので、取れなければ枚数だけで決める
      fetchRegularBadges(),
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

    const badges = progress
      ? buildPublicStampbookBadges({ userId: visitsData.userId, progress, snapshot, representatives })
      : null;
    const [photoUris, picked] = await Promise.all([
      loadRecentPhotoDataUris(visitsData.visits).catch(() => []),
      badges ? pickMedals(badges) : Promise.resolve({ medals: [], more: 0 }),
    ]);

    // ページの上の3つの輪と同じ中身。progress が取れなければ訪問の件数と都道府県だけ
    const totalPrefectures =
      progress?.totalPrefectureCount || FALLBACK_INSTALLED_PREFECTURE_COUNT;
    const awarded = regularBadges.get(visitsData.userId) ?? null;
    const title = progress
      ? titleProgress(progress.visitedManholeCount, progress.totalManholeCount, awarded)
      : null;
    const stats: OgpStat[] = [
      title && progress
        ? { label: '訪問したポケふた', value: progress.visitedManholeCount, total: title.total, colors: title.colors, note: title.note }
        : { label: '訪問スタンプ', value: visitsData.totalVisits },
      {
        label: '訪れた都道府県',
        value: visitsData.prefectureCount,
        ...rankRing(visitsData.prefectureCount, totalPrefectures, '県'),
      },
      ...(progress
        ? [{
            label: '出会ったポケモン',
            value: progress.pokedex.collected,
            ...rankRing(progress.pokedex.collected, progress.pokedex.total, '種'),
          }]
        : []),
    ];

    return new ImageResponse(
      (
        <StampbookOgpCard
          displayName={visitsData.displayName}
          tier={title ? title.current : awarded}
          stats={stats}
          medals={picked.medals}
          moreMedals={picked.more}
          stickers={(badges?.stickers ?? []).map(({ key, icon, name }) => ({ key, icon, name }))}
          photos={photoUris}
        />
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
        // 称号・メダル・ステッカーの絵文字（🌱🥇⬆️ など）。CJK フォントには入っていない
        emoji: 'twemoji',
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
