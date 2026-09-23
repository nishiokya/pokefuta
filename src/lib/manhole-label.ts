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
  /** 図鑑が計算した表示名。`manholeDisplayName()` の正本。 */
  name?: string | null;
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 詳細ページの「目印」欄に出す施設名。全角・連続スペースを半角1つにし、
 * 「指宿市 指宿図書館」のように**区切りのある**先頭の自治体名だけ落とす
 * （図鑑の `landmark_label()` と同じ。「岡谷市役所前」「鈴鹿市伝統産業会館」は残す）。
 * 名前（見出し・一覧）には使わない。そちらは `manholeDisplayName()`。
 */
export function landmarkLabel(manhole: ManholeLabelSource): string {
  let building = (manhole.building || '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  const muni = (manhole.city || manhole.municipality || '').trim();
  if (muni) {
    const label = /[市区町村]$/.test(muni) ? escapeRegExp(muni) : `${escapeRegExp(muni)}[市区町村]`;
    building = building.replace(new RegExp(`^${label}\\s+`), '').trim() || building;
  }
  return building;
}

/**
 * 一覧・カードに出す蓋の名前。**正本は図鑑が日次スナップショットで計算した `name`**
 * （地図の見出しと同じ。施設名があれば「豊橋市 道の駅とよはし」、無ければ「岩手県/宮古市」、
 * 同じ自治体で区別が要るときは「斑鳩町 興留7」など）。写真館では規則を再実装しない。
 *
 * `/api/manholes` はスナップショットをそのまま返すので `name` を持つ。Supabase を直接引く
 * `/api/visits` と `/api/recent-comments` は `fetchSnapshotNames()` で付けてから返す。
 * `name` が無いとき（スナップショット取得失敗など）は title に落とす。これは図鑑と同じ
 * 規則ではなく、あくまで表示を空にしないための暫定。
 */
export function manholeDisplayName(manhole: ManholeLabelSource): string {
  return (
    manhole.name?.trim() ||
    manhole.title?.trim() ||
    [manhole.prefecture, manhole.city || manhole.municipality].filter(Boolean).join('/') ||
    'ポケふた'
  );
}

/** 「宮城県大河原のポケふた」。見出し・title の共通部分。 */
export function manholePlaceLabel(manhole: ManholeLabelSource): string {
  const location = manholeLocationLabel(manhole);
  return `${location || manhole.title || ''}のポケふた`;
}

/**
 * 「宮城県/大河原町のポケふた（チェリム・ラプラス）」。**関連カードのリンク文言**。
 * ポケモンが1件も無くても括弧は出し、中身は「ポケモン」になる。
 * 図鑑の `manhole_label()` と同じ振る舞い。
 */
export function manholeLabel(manhole: ManholeLabelSource): string {
  return `${manholeHeadingPlace(manhole)}（${pokemonText(manhole.pokemons)}）`;
}

/**
 * h1 のポケモン名より前。図鑑の h1（`f"{compose_display_name()}のポケふた"`）と同じく、
 * 正本の名前に「のポケふた」を付けるだけ。施設名から組み立て直さない。
 * 例: 「豊橋市 道の駅とよはしのポケふた」「岩手県/洋野町のポケふた」
 */
export function manholeHeadingPlace(manhole: ManholeLabelSource): string {
  return `${manholeDisplayName(manhole)}のポケふた`;
}

/**
 * 「宮城県/大河原町のポケふた（チェリム・ラプラス）」。**見出し（h1）と JSON-LD の name**。
 * 図鑑の h1 と同じく正本の名前を使う（「豊橋市 道の駅とよはしのポケふた（…）」、
 * `manholeHeadingPlace()`）。`<title>` と og: は検索向けの地域表現で、`manholePlaceLabel()` のまま。
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
