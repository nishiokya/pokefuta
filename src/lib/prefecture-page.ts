/**
 * 都道府県ページ（`/prefectures/[prefecture]`）が読むデータの組み立て。
 *
 * このページの軸は**図鑑（data.pokefuta.com）と重ねない**こと。図鑑の都道府県ページは
 * すでに「市町村別の設置枚数・設置マップ・現地写真・トリビア・一覧・会えるポケモン・
 * 近隣県」を静的生成している。同じ内容をこちらでも作ると、同じ題材の2ページが別ドメインに
 * 並ぶだけになる。
 *
 * こちらが持てるのは、図鑑が持てない「**写真が集まっているか**」の側:
 *
 * - まだ1枚も写真がない蓋（日々変わる。投稿の宛先でもある）
 * - 直近の投稿（利用者が上げた写真）
 * - ログイン中なら自分の訪問済み
 *
 * だから並びは「写真がない蓋」が先で、「集まっている側」は後ろ。設置情報そのものが
 * 見たい人は図鑑へ送る（`prefectureDexUrl`）。
 */

import { PREFECTURE_SLUGS } from './prefectureSlug';

/** スナップショット（`/api/manholes.json`）から、このページが実際に読む分だけ。 */
export interface PrefectureManholeInput {
  id: number;
  prefecture: string | null;
  municipality?: string | null;
  city?: string | null;
  building?: string | null;
  title?: string | null;
  /** 図鑑が計算した表示名（表示名の正本）。 */
  name?: string | null;
  pokemons?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  photo_count: number;
}

export interface PrefectureManhole {
  id: number;
  prefecture: string;
  municipality: string | null;
  city: string | null;
  building: string | null;
  title: string | null;
  name: string | null;
  pokemons: string[];
  latitude: number | null;
  longitude: number | null;
  photoCount: number;
}

export interface PrefectureOverview {
  prefecture: string;
  /** 図鑑の都道府県ページ slug。47都道府県ぶん揃っている。 */
  slug: string | null;
  total: number;
  withPhoto: number;
  missing: number;
  /** 0-100 の整数。 */
  coverage: number;
  isComplete: boolean;
  /** 写真がまだ1枚もない蓋。ページの主役なので最初に出す。 */
  missingManholes: PrefectureManhole[];
  /** 写真がある蓋。地図と「集まっている側」の表示に使う。 */
  photographedManholes: PrefectureManhole[];
  /** 地図の初期中心。県内の蓋の座標から出す。 */
  center: { lat: number; lng: number } | null;
  /** 地図の初期ズーム。県内の蓋の散らばりから決める。 */
  mapZoom: number;
}

/**
 * URL の `[prefecture]` を正式な都道府県名に直す。
 *
 * 受けるのは日本語名（`/prefectures/宮崎県`）と、図鑑と同じローマ字 slug
 * （`/prefectures/miyazaki`）の2つ。図鑑からリンクを張られたときに 404 にしたくない。
 * 正は日本語名の方で、slug で来ても canonical は日本語名に寄せる
 * （`/users/[userId]/prefectures/[prefecture]` が既に日本語名を URL に入れている）。
 *
 * 多重エンコードされた URL でも拾えるよう、decode は保険付きで行う。
 */
export function resolvePrefectureParam(param: string): string | null {
  let value = param;
  try {
    value = decodeURIComponent(param);
  } catch {
    // 不正なパーセント記法。素の値で照合する
  }
  value = value.trim();
  if (!value) return null;

  if (value in PREFECTURE_SLUGS) return value;

  const lowered = value.toLowerCase();
  const bySlug = Object.entries(PREFECTURE_SLUGS).find(
    ([, slug]) => slug === lowered
  );
  return bySlug ? bySlug[0] : null;
}

function normalize(manhole: PrefectureManholeInput): PrefectureManhole {
  return {
    id: manhole.id,
    prefecture: manhole.prefecture ?? '',
    municipality: manhole.municipality ?? null,
    city: manhole.city ?? null,
    building: manhole.building ?? null,
    title: manhole.title ?? null,
    name: manhole.name ?? null,
    pokemons: Array.isArray(manhole.pokemons) ? manhole.pokemons : [],
    latitude: typeof manhole.latitude === 'number' ? manhole.latitude : null,
    longitude: typeof manhole.longitude === 'number' ? manhole.longitude : null,
    photoCount: manhole.photo_count,
  };
}

/**
 * 並びは市区町村名 → id。
 *
 * 写真を集めに行く人は市区町村でまとめて回るので、同じ町の蓋が離れて並ぶと読めない。
 * 市区町村が無い蓋（施設内など）は最後に寄せる。
 */
function byMunicipality(a: PrefectureManhole, b: PrefectureManhole): number {
  const left = a.municipality || a.city || '';
  const right = b.municipality || b.city || '';
  if (left !== right) {
    if (!left) return 1;
    if (!right) return -1;
    return left.localeCompare(right, 'ja');
  }
  return a.id - b.id;
}

export function buildPrefectureOverview(
  manholes: PrefectureManholeInput[],
  prefecture: string
): PrefectureOverview | null {
  const inPrefecture = manholes
    .filter((manhole) => manhole.prefecture === prefecture)
    .map(normalize);

  // 1枚も無い県はページを作らない。ポケふたは47都道府県すべてにあるわけではないので、
  // 空のページを 200 で返すと「設置されている県」と区別が付かない。
  if (inPrefecture.length === 0) return null;

  const missingManholes = inPrefecture
    .filter((manhole) => manhole.photoCount === 0)
    .sort(byMunicipality);
  const photographedManholes = inPrefecture
    .filter((manhole) => manhole.photoCount > 0)
    .sort(byMunicipality);

  const total = inPrefecture.length;
  const withPhoto = photographedManholes.length;

  return {
    prefecture,
    slug: PREFECTURE_SLUGS[prefecture] ?? null,
    total,
    withPhoto,
    missing: missingManholes.length,
    coverage: Math.round((withPhoto / total) * 100),
    isComplete: missingManholes.length === 0,
    missingManholes,
    photographedManholes,
    center: prefectureCenter(inPrefecture),
    mapZoom: prefectureZoom(inPrefecture),
  };
}

/**
 * 地図の初期ズーム。
 *
 * 都道府県ごとに固定値を持たせない。同じ「県」でも、蓋が1つの市に固まっている県
 * （数km四方）と、北海道のように端から端まで散っている県では必要な倍率が2〜3段違う。
 * 実際の蓋の広がりから決めれば、どちらも最初の1画面に収まる。
 */
function prefectureZoom(manholes: PrefectureManhole[]): number {
  const located = manholes.filter(
    (manhole) => manhole.latitude !== null && manhole.longitude !== null
  );
  if (located.length === 0) return 9;

  const lats = located.map((manhole) => manhole.latitude as number);
  const lngs = located.map((manhole) => manhole.longitude as number);
  // 経度は緯度より1度あたりの実距離が短い（日本では約0.8倍）ので、緯度に寄せて比べる。
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    (Math.max(...lngs) - Math.min(...lngs)) * 0.8
  );

  if (span > 3) return 7;
  if (span > 1.5) return 8;
  if (span > 0.6) return 9;
  if (span > 0.2) return 10;
  return 11;
}

/**
 * 地図の初期中心。
 *
 * 都道府県の県庁所在地ではなく、**その県にある蓋の中心**を使う。ポケふたは県内に
 * 均等には置かれておらず（1〜2市に固まっている県が多い）、県庁所在地に寄せると
 * ピンが1つも入らない画から始まることがある。緯度経度の外れ値も無いデータなので、
 * 単純な中点（min/max の中央）で足りる。
 */
function prefectureCenter(
  manholes: PrefectureManhole[]
): { lat: number; lng: number } | null {
  const located = manholes.filter(
    (manhole) => manhole.latitude !== null && manhole.longitude !== null
  );
  if (located.length === 0) return null;

  const lats = located.map((manhole) => manhole.latitude as number);
  const lngs = located.map((manhole) => manhole.longitude as number);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}
