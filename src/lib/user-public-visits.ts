import 'server-only';
import { cache } from 'react';
import { FALLBACK_DISPLAY_NAME } from '@/lib/user-prefecture-progress';
import { loadUserSnapshot } from '@/lib/user-snapshot';

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
};

async function loadPublicUserVisitsImpl(userId: string): Promise<PublicUserVisits | null> {
  // 公開スタンプ帳のスナップショット（R2、無ければ DB から作る）から組み立てる。
  // 非公開に戻した訪問が残らない仕組みは src/lib/user-snapshot.ts に書いた（書き込みの直後に作り直す）。
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;

  const snapshot = await loadUserSnapshot(trimmedUserId);
  if (!snapshot) return null;
  // カードか件数が読めなかった（R2 に無く、DB の一部が失敗した）ときは、今までどおりページを失敗にする
  if (snapshot.missing?.cards || snapshot.missing?.stats) {
    throw new Error('Failed to load public visits');
  }

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

  // 件数が取れなかったとき（null → 0）でも、一覧に出している枚数より小さくはしない
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
  };
}

export const loadPublicUserVisits = cache(loadPublicUserVisitsImpl);
