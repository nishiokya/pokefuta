import 'server-only';
import { cache } from 'react';
import { FALLBACK_DISPLAY_NAME } from '@/lib/user-prefecture-progress';
import { loadUserSnapshot } from '@/lib/user-snapshot';
import type { UserSnapshot } from '@/lib/user-snapshot-format';

export type PublicVisitManhole = {
  id: number;
  title: string | null;
  prefecture: string | null;
  municipality: string | null;
  pokemons: string[];
};

export type PublicVisit = {
  id: string;
  manholeId: number | null;
  shotAt: string | null;
  comment: string | null;
  createdAt: string | null;
  manhole: PublicVisitManhole | null;
  photoIds: string[];
  isLandscape: boolean;
  /** 先頭写真の AI タグ（photo.ai_tags）。表示は src/lib/photo-ai-tags.ts */
  aiTags: unknown;
};

export type PublicUserVisits = {
  userId: string;
  displayName: string;
  bio: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
  // 募集スイッチが OFF のユーザーでは常に null。出し分けは get_public_profile() 側で行う
  pokemonGoFriendCode: string | null;
  pokemonGoFriendNote: string | null;
  /** アイコンの写真ID。本人の公開訪問の写真のときだけ入る（get_public_avatar_photo_id） */
  avatarPhotoId: string | null;
  totalVisits: number;
  prefectureCount: number;
  visits: PublicVisit[];
  isTruncated: boolean;
  /** DB の版（スナップショットと同じ時点）。OGP の版に入れる（公開取り消しで画像の URL・キーを変える） */
  snapshotRev: string;
};

/**
 * 公開スタンプ帳のスナップショット（src/lib/user-snapshot.ts）から一覧を組み立てる。
 * Route Handler（OGP）は入口で1回 loadUserSnapshot して、同じスナップショットをここと県別・ステッカーに渡す。
 */
export function publicUserVisitsFromSnapshot(userId: string, snapshot: UserSnapshot): PublicUserVisits {
  const trimmedUserId = userId.trim();
  const appUserRow = snapshot.profile;
  const displayName = appUserRow.display_name || FALLBACK_DISPLAY_NAME;

  // note / shot_location はビューの列に無いので、スナップショットにも入らない。
  // 総数・都道府県数はカード（500件上限）からではなく、全件の集計（本人の共有文と同じ関数）を使う。
  const publicVisits: PublicVisit[] = snapshot.cards.map((visit) => ({
    id: visit.id,
    manholeId: visit.manhole_id,
    shotAt: visit.shot_at,
    comment: visit.comment,
    createdAt: visit.created_at,
    // manhole_id が無い訪問はビューでも LEFT JOIN なので全列 null になる
    manhole: visit.manhole_id === null
      ? null
      : {
          id: visit.manhole_id,
          title: visit.manhole_title,
          prefecture: visit.manhole_prefecture,
          municipality: visit.manhole_municipality,
          pokemons: Array.isArray(visit.manhole_pokemons) ? visit.manhole_pokemons : [],
        },
    photoIds: visit.latest_photo_id ? [visit.latest_photo_id] : [],
    isLandscape: visit.latest_photo_is_landscape === true,
    aiTags: visit.latest_photo_ai_tags ?? null,
  }));

  // 一覧に出している枚数より小さくはしない
  const totalVisits = Math.max(snapshot.stats.totalVisits, publicVisits.length);

  return {
    userId: trimmedUserId,
    displayName,
    bio: appUserRow.bio || null,
    xUrl: appUserRow.x_url || null,
    instagramUrl: appUserRow.instagram_url || null,
    pokemonGoFriendCode: appUserRow.pokemon_go_friend_code || null,
    pokemonGoFriendNote: appUserRow.pokemon_go_friend_note || null,
    avatarPhotoId: snapshot.avatarPhotoId,
    totalVisits,
    prefectureCount: snapshot.stats.prefectureCount,
    visits: publicVisits,
    isTruncated: totalVisits > publicVisits.length,
    snapshotRev: snapshot.rev,
  };
}

async function loadPublicUserVisitsImpl(userId: string): Promise<PublicUserVisits | null> {
  const snapshot = await loadUserSnapshot(userId);
  return snapshot ? publicUserVisitsFromSnapshot(userId, snapshot) : null;
}

export const loadPublicUserVisits = cache(loadPublicUserVisitsImpl);
