import type { Manhole } from '@/types/database';

type SearchableManhole = Pick<Manhole, 'title' | 'prefecture' | 'municipality' | 'pokemons'> & {
  city?: string;
};

/**
 * 蓋の名前・県・市区町村・ポケモン名に検索語が含まれるか。
 * /nearby の「地域名・ポケモン名で検索」と、投稿画面の蓋選び（Android で撮ってある写真を投稿するとき）で共有する。
 */
export function matchesManholeQuery(manhole: SearchableManhole, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const target = [
    manhole.title,
    manhole.prefecture,
    manhole.municipality,
    manhole.city,
    ...(manhole.pokemons || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return target.includes(normalized);
}
