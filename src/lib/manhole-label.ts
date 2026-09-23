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
  building?: string | null;
  address?: string | null;
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

const MUNICIPALITY_SUFFIX = /[市区町村]$/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 接尾辞まで揃った自治体名（「豊橋」→「豊橋市」）。揃わなければ空文字。
 * 図鑑の `display_names.municipality_label()` / `_complete_municipality()` と同じく、
 * 住所 → title（「愛知県/豊橋市」）の後半の順で補う。
 */
export function municipalityLabel(manhole: ManholeLabelSource): string {
  const muni = (manhole.city || manhole.municipality || '').trim();
  if (muni && MUNICIPALITY_SUFFIX.test(muni)) return muni;
  if (muni && manhole.address) {
    const hit = manhole.address.match(new RegExp(`${escapeRegExp(muni)}[市区町村]`));
    if (hit) return hit[0];
  }
  const tail = (manhole.title || '').split('/')[1]?.trim() ?? '';
  return MUNICIPALITY_SUFFIX.test(tail) ? tail : '';
}

/**
 * 表示用の施設名。図鑑の `landmark_label()` と同じく、全角・連続スペースを半角1つにし、
 * 先頭の自治体名（「指宿市 指宿図書館」）を落とす。
 */
export function landmarkLabel(manhole: ManholeLabelSource, cityLabel = municipalityLabel(manhole)): string {
  let building = (manhole.building || '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  if (cityLabel && building.startsWith(cityLabel)) building = building.slice(cityLabel.length).trim();
  return building;
}

/**
 * 一覧・カードに出す蓋の名前。**図鑑の地図の見出し（`place_label || title`）と同じ形**。
 * 施設名があれば「豊橋市 道の駅とよはし」、無ければ title の「岩手県/宮古市」。
 * 以前は画面ごとに「豊橋・道の駅とよはし」「岩手県 宮古」と組み立てがばらばらだった。
 */
export function manholeDisplayName(manhole: ManholeLabelSource): string {
  const city = municipalityLabel(manhole);
  const place = city ? landmarkLabel(manhole, city) : '';
  if (place) return `${city} ${place}`;
  const title = (manhole.title || '').trim();
  if (title) return title;
  const muni = manhole.city || manhole.municipality || '';
  return [manhole.prefecture, muni].filter(Boolean).join('/') || 'ポケふた';
}

/** 「宮城県大河原のポケふた」。見出し・title の共通部分。 */
export function manholePlaceLabel(manhole: ManholeLabelSource): string {
  const location = manholeLocationLabel(manhole);
  return `${location || manhole.title || ''}のポケふた`;
}

/**
 * 「宮城県大河原のポケふた（チェリム・ラプラス）」。**関連カードのリンク文言**。
 * ポケモンが1件も無くても括弧は出し、中身は「ポケモン」になる。
 * 図鑑の `manhole_label()` と同じ振る舞い。
 */
export function manholeLabel(manhole: ManholeLabelSource): string {
  return `${manholePlaceLabel(manhole)}（${pokemonText(manhole.pokemons)}）`;
}

/** h1 のポケモン名より前。施設名があれば「愛知県豊橋 道の駅とよはしのポケふた」。 */
export function manholeHeadingPlace(manhole: ManholeLabelSource): string {
  const landmark = landmarkLabel(manhole, municipalityLabel(manhole) || manhole.city || manhole.municipality || '');
  if (!landmark) return manholePlaceLabel(manhole);
  const location = manholeLocationLabel(manhole) || manhole.title || '';
  return `${location} ${landmark}のポケふた`;
}

/**
 * 「宮城県大河原のポケふた（チェリム・ラプラス）」。**見出し（h1）と JSON-LD の name**。
 * 施設名があれば図鑑の h1 と同じく「愛知県豊橋 道の駅とよはしのポケふた（…）」と入れる
 * （`manholeHeadingPlace()`）。`<title>` と og: は検索向けに `manholePlaceLabel()` のまま。
 *
 * `manholeLabel()` と違い、ポケモンが1件も無ければ括弧ごと落とす。図鑑は h1 と
 * 関連カードで規則を分けており（`h1 += "（…）" if pokemons` に対し
 * `manhole_label()` は常に括弧＋「ポケモン」）、ここもそれに合わせる。
 * 1本に畳むと、ポケモン不明の蓋の見出しが「〜のポケふた（ポケモン）」になる。
 */
export function manholeHeading(manhole: ManholeLabelSource): string {
  const place = manholeHeadingPlace(manhole);
  const list = filterPokemons(manhole.pokemons);
  return list.length > 0 ? `${place}（${list.join('・')}）` : place;
}

/**
 * 「10.7 km」。図鑑の近傍セクションと同じく常に小数1桁。
 * 以前は写真館だけが 10km 以上を整数に丸めていて、同じ蓋の同じ距離が
 * 図鑑「10.7 km」／写真館「11 km」と食い違っていた。
 */
export function formatDistanceKm(km: number): string {
  return `${km.toFixed(1)} km`;
}
