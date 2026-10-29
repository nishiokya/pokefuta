import {
  badgeRank,
  byCollected,
  buildPokemonBadges,
  buildDesignManholeSticker,
  buildPlushSticker,
  buildThemeBadges,
  pokemonBadgeManholeIds,
  type BadgeManhole,
} from '@/lib/badge-catalog';
import type { ManholeSnapshot } from '@/lib/manhole-snapshot';
import { newUnvisitedSinceEarned } from '@/lib/prefecture-new-manholes';
import type { PublicUserPrefectureProgress } from '@/lib/user-prefecture-progress';

/**
 * 公開スタンプ帳の都道府県・ポケモンのバッジ（金・銀・銅）とステッカー。
 * ページ（/users/[userId]/visits）と、その OGP 画像で同じものを出すため1か所で組み立てる。
 * 数えるのは公開の訪問の蓋だけ（再訪は1枚）。
 */
export function buildPublicStampbookBadges({
  userId,
  progress,
  snapshot,
  representatives,
  designManholeCount = 0,
  plushCount = 0,
}: {
  userId: string;
  progress: PublicUserPrefectureProgress;
  snapshot: ManholeSnapshot | null;
  representatives: ReadonlyMap<string, number>;
  /** 公開したデザインマンホールの枚数。1枚以上でステッカーが付く */
  designManholeCount?: number;
  /** ぬいぐるみが写った公開訪問の数（各訪問の最新の写真のタグで数える）。1以上でステッカーが付く */
  plushCount?: number;
}) {
  // ステッカーの判定に蓋のテーマ（hashtags）が要る
  const hashtagsById = new Map((snapshot?.manholes ?? []).map((m) => [m.id, Array.isArray(m.hashtags) ? m.hashtags : null]));
  const catalog = progress.prefectures.flatMap((p) => p.manholes);
  const manholes: BadgeManhole[] = catalog.map((m) => ({
    id: m.id,
    prefecture: m.prefecture,
    pokemons: m.pokemons,
    hashtags: hashtagsById.get(m.id) ?? null,
  }));
  const visited = new Set(catalog.filter((m) => m.visited).map((m) => m.id));
  const medalIds = pokemonBadgeManholeIds(manholes, representatives);
  return {
    // 一度制覇した県は、あとでポケふたが増えても金のまま（増えた分は +N、回り直すと🥇×2）
    prefectures: progress.prefectures
      .filter((p) => p.visited > 0 || p.earnedAt)
      .map((p) => ({
        name: p.name,
        label: p.name === '北海道' ? p.name : p.name.replace(/[都府県]$/, ''),
        visited: p.visited,
        total: p.total,
        rank: p.earnedAt ? ('gold' as const) : badgeRank(p.visited, p.total),
        goldCount: p.earnedCount,
        newCount: newUnvisitedSinceEarned(p),
        href: `/users/${encodeURIComponent(userId)}/prefectures/${encodeURIComponent(p.name)}`,
      }))
      .sort(byCollected),
    pokemon: buildPokemonBadges(manholes, visited)
      .filter((p) => p.visited > 0)
      .sort(byCollected)
      .map((p) => ({ ...p, manholeId: medalIds.get(p.name) })),
    stickers: [...buildThemeBadges(manholes, visited), buildPlushSticker(plushCount), buildDesignManholeSticker(designManholeCount)].filter((s) => s.earned),
  };
}

export type PublicStampbookBadges = ReturnType<typeof buildPublicStampbookBadges>;
