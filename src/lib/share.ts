const DEFAULT_HASHTAGS = ['ポケふた', 'ポケモンマンホール'];

function normalizeHashtag(tag: string): string {
  return tag.replace(/^#+/, '').trim();
}

export function buildXShareUrl(text: string, pageUrl: string, hashtags: string[] = []): string {
  const mergedHashtags = [...hashtags, ...DEFAULT_HASHTAGS]
    .map(normalizeHashtag)
    .filter(Boolean);

  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}&hashtags=${encodeURIComponent(mergedHashtags.join(','))}`;
}

export function buildLineShareUrl(pageUrl: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`;
}

export function manholeShareText(municipality: string, pokemons: string[] = []): string {
  const pokemonStr = pokemons.slice(0, 3).join('・');
  return pokemonStr
    ? `${pokemonStr}のポケふたを${municipality}で見つけました！`
    : `${municipality}のポケふたを見つけました！`;
}

export function photoShareText(municipality: string, hashtags: string[] = [], pokemons: string[] = []): string {
  const pokemonStr = pokemons.slice(0, 3).join('・');
  const titleTags = hashtags.slice(0, 2).join(' ');
  const base = pokemonStr
    ? `${pokemonStr}のポケふたを${municipality}で記録しました！`
    : `${municipality}のポケふたを記録しました！`;
  return [base, titleTags].filter(Boolean).join('\n');
}

export function visitsShareText(stampCount: number): string {
  return `ポケふた旅を続けています！\n${stampCount}枚のポケふたを巡りました`;
}

export function prefectureProgressShareText(
  completedPrefectureCount: number,
  totalPrefectureCount: number
): string {
  return `${completedPrefectureCount}/${totalPrefectureCount}都道府県のポケふたを制覇しました！`;
}

export function prefectureCardShareText(
  prefectureName: string,
  visited: number,
  total: number,
  complete: boolean
): string {
  return complete
    ? `${prefectureName}のポケふたを全て制覇しました！`
    : `${prefectureName}のポケふたを${visited}/${total}枚制覇中です！`;
}
