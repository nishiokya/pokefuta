import type { Manhole } from '@/types/database';

type SearchableManhole = Pick<Manhole, 'title' | 'prefecture' | 'municipality' | 'pokemons'> & {
  city?: string;
};

/**
 * 蓋の名前・県・市区町村・ポケモン名に検索語が含まれるか。
 * /nearby の「地域名・ポケモン名で検索」と、投稿画面の蓋選び（Android で撮ってある写真を投稿するとき）で共有する。
 *
 * 空白（全角を含む）で区切った語は、すべて含まれるときだけ一致にする。
 * 「ラプラス 宮城」のように、ポケモン名に地域名を足して絞り込めるようにするため。
 */
export function matchesManholeQuery(manhole: SearchableManhole, query: string): boolean {
  const terms = query.toLowerCase().split(/[\s\u3000]+/).filter(Boolean);
  if (terms.length === 0) return true;
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
  return terms.every(term => target.includes(term));
}
