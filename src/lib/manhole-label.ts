/**
 * 蓋の表示ラベルと距離表記。**図鑑（data.pokefuta.com）と同じ規則をここに1本化する。**
 *
 * 図鑑側の正は pokefuta-tracker の `apps/scraper/generate_manhole_pages.py`
 * （`filter_pokemons` / `manhole_label` / `format_pokemon_label` と近傍セクションの距離書式）。
 *
 * 以前は写真館だけがポケモンを3件で切っていたため、「同じポケモンのポケふた」の
 * 一覧で**共通のポケモンがラベルから消えて**、なぜ関連なのか読み取れなかった。
 * 例: 128（チェリム・ラプラス）から見た 宮城県仙台 が
 * 「（ウミディグダ・チョンチー・ホエルコ）」と出て、ラプラスが落ちていた。
 * 省略するなら共通ポケモンを残す必要があるが、図鑑は省略していないので揃える。
 */

export type ManholeLabelSource = {
  prefecture?: string | null;
  city?: string | null;
  municipality?: string | null;
  pokemons?: string[] | null;
  title?: string | null;
};

/** 都道府県サイトへのリンク等がポケモン名の配列に混ざることがあるので落とす。 */
export function filterPokemons(pokemons?: string[] | null): string[] {
  if (!Array.isArray(pokemons)) return [];
  return pokemons.filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '' && !p.includes('ローカルActs')
  );
}

/** ポケモン名の羅列。**省略しない**（理由はファイル冒頭）。 */
export function pokemonText(pokemons?: string[] | null): string {
  const list = filterPokemons(pokemons);
  return list.length > 0 ? list.join('・') : 'ポケモン';
}

/** OGP・SNS カード専用の短縮形。最大3件＋「ほか」。本文の見出しには使わない。 */
export function pokemonMetaLabel(pokemons?: string[] | null): string {
  const list = filterPokemons(pokemons);
  if (list.length === 0) return 'ポケモン';
  if (list.length <= 3) return list.join('・');
  return `${list.slice(0, 3).join('・')} ほか`;
}

/** 「宮城県大河原」。city を優先し、無ければ municipality。 */
export function manholeLocationLabel(manhole: ManholeLabelSource): string {
  const muni = manhole.city || manhole.municipality || '';
  return `${manhole.prefecture ?? ''}${muni}`;
}

/** 「宮城県大河原のポケふた」。見出し・title の共通部分。 */
export function manholePlaceLabel(manhole: ManholeLabelSource): string {
  const location = manholeLocationLabel(manhole);
  return `${location || manhole.title || ''}のポケふた`;
}

/** 「宮城県大河原のポケふた（チェリム・ラプラス）」。h1 と関連カードのリンク文言。 */
export function manholeLabel(manhole: ManholeLabelSource): string {
  return `${manholePlaceLabel(manhole)}（${pokemonText(manhole.pokemons)}）`;
}

/**
 * 「10.7 km」。図鑑の近傍セクションと同じく常に小数1桁。
 * 以前は写真館だけが 10km 以上を整数に丸めていて、同じ蓋の同じ距離が
 * 図鑑「10.7 km」／写真館「11 km」と食い違っていた。
 */
export function formatDistanceKm(km: number): string {
  return `${km.toFixed(1)} km`;
}
