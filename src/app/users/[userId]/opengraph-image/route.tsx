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
import { loadPublicStickerCounts } from '@/lib/sticker-counts';
import { buildPublicStampbookBadges, type PublicStampbookBadges } from '@/lib/public-stampbook-badges';
import { stampbookOgpVersion } from '@/lib/stampbook-ogp-version';
import { fetchRegularBadges } from '@/lib/regular-badges';
import { rankRing } from '@/components/users/HeroStat';
import { titleProgress } from '@/components/users/title-progress';
import StampbookOgpCard, {
  OGP_MEDAL_COUNT,
  OGP_MEDAL_SIZE,
  OGP_PHOTO_COUNT,
  OGP_PHOTO_SIZE,
  withoutEmoji,
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
const PHOTO_FETCH_TIMEOUT_MS = 2500; // 最悪ケースを抑える（4000 から短縮）
// メダルの段のうち都道府県に使う数。残りをポケモンで埋める（どちらかが足りなければもう片方で埋める）
const PREFECTURE_MEDAL_SLOTS = 4;

// 生成時間の内訳。Server-Timing ヘッダーで返す（X のクローラーが待ちきれない遅さの切り分け用）
type Timings = Map<string, number>;
async function timed<T>(timings: Timings, name: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  const start = performance.now();
  try {
    return await (typeof work === 'function' ? work() : work);
  } finally {
    timings.set(name, Math.max(timings.get(name) ?? 0, performance.now() - start));
  }
}
const serverTiming = (timings: Timings) =>
  Array.from(timings, ([name, ms]) => `${name};dur=${ms.toFixed(0)}`).join(', ');

// R2 に生成済み PNG を永続化する理由:
// - 冷えた生成は 9〜12 秒かかり、X のクローラー（主に米国のエッジ経由）が待ちきれずカードが出ない。
// - CloudFront はエッジごとにキャッシュし、Amplify はデプロイのたびに CDN を無効化する。日本から温めても効かない。
// - R2 に置けばどのエッジ・どのデプロイからでも数百 ms で返せる。
// プライバシー: 読むのは「いまの公開内容」から作ったバージョンのキーだけ。内容が変われば別キーになり、
// 古いオブジェクトは配られない。オブジェクトはバケット内で非公開（署名 URL 経由でのみ読む）。
// 注意: 古い版のオブジェクトは残り続ける（内容が変わるたびにユーザーあたり約 0.5 MB 増える）。
// 掃除は後回し。ライフサイクルルール（ogp/ プレフィックスを N 日で削除）を入れる案がある。
const OGP_OBJECT_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const R2_READ_TIMEOUT_MS = 2000;
// バージョンに入らない入力（デザインマンホール・ステッカー数、カタログの総数、バッジ）は変わり得るので、
// R2 のオブジェクトにも寿命を持たせる。1日を過ぎたら作り直して同じキーに上書きする。
// これで古さは最大およそ1日に収まり、CDN の s-maxage（1日）と揃う。Last-Modified が無ければ古いものとして扱う。
const OGP_R2_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function readCachedPng(key: string): Promise<{ png: ArrayBuffer | null; stale: boolean }> {
  try {
    const signed = await storage.getSignedUrl(key, 60);
    const response = await fetch(signed.url, { signal: AbortSignal.timeout(R2_READ_TIMEOUT_MS) });
    if (!response.ok) return { png: null, stale: false };
    const body = await response.arrayBuffer();
    if (sniffImageFormat(body) !== 'png') return { png: null, stale: false };
    const modified = Date.parse(response.headers.get('last-modified') ?? '');
    if (!Number.isFinite(modified) || Date.now() - modified > OGP_R2_MAX_AGE_MS) return { png: null, stale: true };
    return { png: body, stale: false };
  } catch {
    return { png: null, stale: false };
  }
}

function successHeaders(timings: Timings, cacheStatus: string, degraded: boolean): Record<string, string> {
  return {
    'Content-Type': 'image/png',
    'Server-Timing': serverTiming(timings),
    'X-OGP-Cache': cacheStatus,
    // URL の ?v= に公開内容の印が入るので、訪問・写真・表示名が変われば URL ごと変わる。
    // ただし CDN は1日まで: 非公開に戻した写真が配られ続けないように、
    // また印に入れていない入力（デザインマンホール・ステッカー数、図鑑の総数）のずれも1〜2日で解消する
    // 一部の入力が取れずに欠けた描画（degraded）は CDN にも長く載せない
    'Cache-Control': degraded
      ? 'public, max-age=60, s-maxage=300'
      : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  };
}

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
async function loadRecentPhotoDataUris(visits: PublicVisit[], timings: Timings): Promise<{ uris: string[]; expected: number }> {
  const photoIds = visits
    // このOGPは投稿単体ではなくスタンプ帳の代表画像。風景を蓋の代表に見せない。
    // 風景投稿そのものはプロフィール本文と写真単体共有でラベル付き表示を続ける。
    .filter((visit) => !visit.isLandscape)
    .map((visit) => visit.photoIds[0])
    .filter((id): id is string => Boolean(id))
    .slice(0, OGP_PHOTO_COUNT);

  if (photoIds.length === 0) return { uris: [], expected: 0 };

  const expected = photoIds.length;
  const supabase = getProgressClient();
  if (!supabase) return { uris: [], expected };

  // photoIds は公開訪問由来だが、直接クエリでも is_public を再確認して二重に守る
  const { data, error } = await timed(timings, 'photo_select', async () =>
    supabase
      .from('photo')
      .select('id, storage_key, visit:visit_id!inner(is_public)')
      .in('id', photoIds)
      .eq('visit.is_public', true)
  );

  if (error || !data) {
    if (error) console.error('[OGP] users visits photo select failed:', error.message);
    return { uris: [], expected };
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
        const input = await timed(timings, 'photo_fetch_max', async () => {
          let response = smallKey ? await fetchPhoto(smallKey).catch(() => null) : null;
          if (!response) {
            response = await fetchPhoto(storageKey);
          }
          return response ? Buffer.from(await response.arrayBuffer()) : null;
        });
        if (!input) return null;
        // 保存済みの写真も利用者が送った画像。JPEG/PNG/WebP 以外は sharp に渡さず、その枠を飛ばす
        if (!sniffImageFormat(input)) return null;
        const jpeg = await timed(timings, 'photo_sharp_max', () =>
          sharp(input)
            .rotate()
            .resize(PHOTO_RENDER_SIZE, PHOTO_RENDER_SIZE, { fit: 'cover' })
            .jpeg({ quality: 72 })
            .toBuffer()
        );

        return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      } catch {
        return null;
      }
    })
  );

  return { uris: results.filter((uri): uri is string => Boolean(uri)), expected };
}

// ポケモンのメダルに入れる蓋の切り抜き（data.pokefuta.com の静的画像）。取れなければ空の丸
async function loadLidDataUri(manholeId: number, timings: Timings): Promise<string | null> {
  try {
    const response = await timed(timings, 'lid_fetch_max', fetch(lidImageUrl(manholeId), { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) }));
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
async function pickMedals(
  badges: PublicStampbookBadges,
  timings: Timings
): Promise<{ medals: OgpMedal[]; more: number; lidFailures: number }> {
  const prefSlots = Math.max(PREFECTURE_MEDAL_SLOTS, OGP_MEDAL_COUNT - badges.pokemon.length);
  const prefectures = badges.prefectures.slice(0, prefSlots);
  const pokemon = badges.pokemon.slice(0, OGP_MEDAL_COUNT - prefectures.length);
  // 蓋が無いポケモン（manholeId なし）は元から空の丸。取りに行って取れなかった数だけを失敗として数える
  let lidFailures = 0;
  const pokemonMedals = await Promise.all(
    pokemon.map(async (p): Promise<OgpMedal> => {
      const image = p.manholeId !== undefined ? await loadLidDataUri(p.manholeId, timings) : null;
      if (p.manholeId !== undefined && image === null) lidFailures += 1;
      return {
        kind: 'pokemon',
        key: `pokemon-${p.name}`,
        image,
        rank: badgeRank(p.visited, p.total),
        rate: rate(p.visited, p.total),
      };
    })
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
  return { medals, more: badges.prefectures.length + badges.pokemon.length - medals.length, lidFailures };
}

export async function GET(request: Request, { params }: RouteContext) {
  const timings: Timings = new Map();
  const startedAt = performance.now();
  try {
    const visitsData = await timed(timings, 'visits', loadPublicUserVisits(params.userId));
    if (!visitsData) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    // 生成済み PNG を R2 に置く。キーは「いまの公開内容」から作ったバージョンだけを使い、
    // リクエストの ?v= では引かない（古い版は配らず、任意の ?v= でオブジェクトも増やせない）
    const version = stampbookOgpVersion(visitsData);
    const cacheKey = /^[A-Za-z0-9-]+$/.test(version) ? `ogp/users/${visitsData.userId}/${version}.png` : null;
    let r2Stale = false;
    if (cacheKey) {
      const { png: cached, stale } = await timed(timings, 'r2_read', readCachedPng(cacheKey));
      r2Stale = stale;
      if (cached) {
        timings.set('r2_hit', 1);
        timings.set('total', performance.now() - startedAt);
        console.log(`[OGP] users visits timing: ${serverTiming(timings)}`);
        return new Response(cached, { headers: successHeaders(timings, 'r2-hit', false) });
      }
    }

    const [progress, fontData, snapshot, representatives, regularBadges] = await timed(timings, 'stage1', Promise.all([
      timed(timings, 'progress', loadPublicUserPrefectureProgress(params.userId).catch(() => null)),
      timed(timings, 'font', loadNotoSansCjk()),
      // ステッカーの判定に蓋のテーマ（hashtags）が要る。スナップショットは1時間キャッシュされる
      timed(timings, 'snapshot', fetchManholeSnapshot().catch(() => null)),
      timed(timings, 'representatives', fetchPokemonRepresentatives()),
      // 称号は飾りなので、取れなければ枚数だけで決める
      timed(timings, 'regular_badges', fetchRegularBadges()),
    ]));

    if (!fontData) {
      // フォントなしで satori に CJK を渡すと描画時に throw して 500 になるだけなので、
      // 原因がわかる形で早期に落とす
      console.error('[OGP] users visits: CJK font is missing, cannot render');
      return new Response('Font unavailable', {
        status: 500,
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    const { designManholeCount, plushCount, snowCount } = progress
      ? await timed(timings, 'counts', loadPublicStickerCounts(visitsData.userId))
      : { designManholeCount: 0, plushCount: 0, snowCount: 0 };
    const badges = progress
      ? buildPublicStampbookBadges({ userId: visitsData.userId, progress, snapshot, representatives, designManholeCount, plushCount, snowCount })
      : null;
    const [photoResult, picked] = await timed(timings, 'stage3', Promise.all([
      timed(timings, 'photos', loadRecentPhotoDataUris(visitsData.visits, timings).catch(() => ({ uris: [] as string[], expected: -1 }))),
      timed(timings, 'medals', badges ? pickMedals(badges, timings) : Promise.resolve({ medals: [], more: 0, lidFailures: 0 })),
    ]));

    const photoUris = photoResult.uris;
    // 一部の入力が取れずに欠けた描画は R2 に保存しない（取れなかった形のまま固定されるのを防ぐ）。
    // representatives は失敗しても空の Map を返すだけなので、空なら欠けとみなす（全ポケモン分あるはずの表）。
    // 称号（regularBadges）は見ない: 正しく空のこともあり、使うのは progress が取れないとき（＝既に欠け扱い）だけ。
    // デザインマンホール・ステッカーの件数は失敗時に 0 を返す実装で見分けられず、ここでは検出できない
    // （その古さは R2 の寿命 24h で収まる）。
    const degraded =
      !progress ||
      !snapshot ||
      representatives.size === 0 ||
      photoResult.expected < 0 ||
      photoUris.length < photoResult.expected ||
      picked.lidFailures > 0;

    // ページの上の3つの輪と同じ中身。progress が取れなければ訪問の件数と都道府県だけ
    const totalPrefectures =
      progress?.totalPrefectureCount || FALLBACK_INSTALLED_PREFECTURE_COUNT;
    const awarded = regularBadges.get(visitsData.userId) ?? null;
    const title = progress
      ? titleProgress(progress.visitedManholeCount, progress.totalManholeCount)
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

    const card = (plain: boolean) => (
      <StampbookOgpCard
        displayName={plain ? withoutEmoji(visitsData.displayName) : visitsData.displayName}
        tier={title ? title.current : awarded}
        stats={stats}
        medals={picked.medals}
        moreMedals={picked.more}
        stickers={(badges?.stickers ?? []).map(({ key, icon, name }) => ({ key, icon, name }))}
        photos={photoUris}
        plain={plain}
      />
    );
    const options = {
      ...size,
      fonts: [
        {
          name: 'NotoSansCJK',
          data: fontData,
          weight: 700 as const,
        },
      ],
    };

    // ImageResponse は遅延描画（本体のストリームを読むときに描く）なので、ここで try/catch しても
    // 描画の失敗は拾えず、200 を返したあとに本体が途中で切れる。先に arrayBuffer() で実体化して失敗を拾う。
    // 絵文字（🌱🥇 など。CJK フォントには入っていない）は描画のたびに CDN から画像を取るので、
    // CDN が落ちるとここで落ちる。その場合は絵文字なしで描き直す。
    try {
      const png = await timed(timings, 'render', new ImageResponse(card(false), { ...options, emoji: 'twemoji' }).arrayBuffer());
      // 描画した ?v= がいまの版と一致するときだけ保存する。Lambda はレスポンス後に凍結され得るので await する
      const prefix = r2Stale ? 'stale' : 'miss';
      let cacheStatus = degraded ? `${prefix}-degraded` : prefix;
      if (!degraded && cacheKey && new URL(request.url).searchParams.get('v') === version) {
        try {
          await timed(timings, 'r2_write', storage.put(cacheKey, Buffer.from(png), { contentType: 'image/png', cacheControl: OGP_OBJECT_CACHE_CONTROL }));
          cacheStatus = `${prefix}-stored`;
        } catch (err) {
          console.error('[OGP] users visits R2 write failed:', err instanceof Error ? err.message : err);
        }
      }
      timings.set('total', performance.now() - startedAt);
      console.log(`[OGP] users visits timing: ${serverTiming(timings)}`);
      return new Response(png, { headers: successHeaders(timings, cacheStatus, degraded) });
    } catch (err) {
      console.error('[OGP] users visits render with emoji failed, retrying without emoji:', err);
    }
    // 絵文字なしの描き直し。壊れた見た目（絵文字が無い）を1時間配らないよう、短いキャッシュにする
    const png = await new ImageResponse(card(true), options).arrayBuffer();
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    console.error('[OGP] users visits render failed:', err);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }
}
