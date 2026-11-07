/**
 * 写真に付いた AI の判定タグ（photo.ai_tags）から、写真館に出すタグを決める。
 *
 * ai_tags は k11 の manhole-score が毎朝の採点で書く（supabase/migrations/20261004100000_photo_ai_tags.sql）。
 * アプリは判定しない。ここは「どれを出すか」だけを決める。
 *
 * 既存の3つに、人物・雪・紅葉・足元を追加（docs/photo-ai-tags.md）:
 *   ぬいぐるみ … plush（学習した分類器。閾値は k11 側で決めて真偽で入る）
 *   夜         … night（撮影時刻と蓋の位置から求めた太陽高度が −6° 未満）。AI の判定ではないので
 *                「AI」の印を付けない（「AI夜」と並ぶと意味が通らない）
 *   風景       … scene が landscape。投稿者が「周辺の風景」を選んだ写真は、そのバッジが出るので重ねない
 * scene の wide_context（周辺も写る）は写真の半分以上に付くので、タグとしては出さない。
 * signage_info（看板）は教師が足りず精度が出ていないので出さない。
 */

export type PhotoAiTags = {
  model?: string;
  scene?: 'centered_clean' | 'wide_context' | 'signage_info' | 'landscape';
  plush?: boolean;
  plush_score?: number;
  /** K11 の公開用属性モデル。独立した検証分の適合率 50% 以上で採用 */
  person?: boolean;
  snow?: boolean;
  autumn?: boolean;
  feet?: boolean;
  attrs_model?: string;
  night?: boolean | null;
  /** 一覧の正方形の位置 [x0, y0, x1, y1]（0〜1）。蓋の枠に寄せてある。20261004120000 */
  crop?: [number, number, number, number];
  /** 蓋が crop の正方形に収まる（はみ出し 10% 以下） */
  lid_fits?: boolean | null;
  /** 蓋の枠 [x0, y0, x1, y1]（0〜1）。crop を決めるのに使った枠。20261005100000 */
  lid?: [number, number, number, number];
  /** ぬいぐるみ全部を囲む枠 [x0, y0, x1, y1]（0〜1）。plush が真の写真だけ。20261005200000 */
  plush_box?: [number, number, number, number];
};

export type AiTagKey = 'plush' | 'night' | 'landscape' | 'person' | 'snow' | 'autumn' | 'feet';

/** ai: AI が写真から判定したか（「AI」の印を付ける）。夜は撮影時刻と場所から決まるので false */
export type AiTag = { key: AiTagKey; label: string; ai: boolean };

// チップには「AI」の印を付けない（かっこ悪いという利用者の声）。代わりにタグを出す画面の下にこの注釈を出す
// （AiTagNote）。夜は AI ではなく撮影時刻と場所の規則なので、文言で区別する
export const AI_TAG_HELP =
  'ぬいぐるみ・風景・人物・雪・紅葉・足元のタグは AI で、夜のタグは撮影時刻と場所から自動で判定しています。間違っていたらごめんなさい。';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function photoAiTags(
  photo: { ai_tags?: unknown; is_landscape?: boolean | null },
  { compact = false }: { compact?: boolean } = {},
): AiTag[] {
  const tags = photo.ai_tags;
  if (!isRecord(tags)) return [];
  const out: AiTag[] = [];
  if (tags.plush === true) out.push({ key: 'plush', label: 'ぬいぐるみ', ai: true });
  if (tags.night === true) out.push({ key: 'night', label: '夜', ai: false });
  if (tags.scene === 'landscape' && !photo.is_landscape) out.push({ key: 'landscape', label: '風景', ai: true });
  for (const [key, label] of [['person', '人物'], ['snow', '雪'], ['autumn', '紅葉'], ['feet', '足元']] as const) {
    if (compact && (key === 'person' || key === 'feet')) continue;
    if (tags[key] === true) out.push({ key, label, ai: true });
  }
  return out;
}

/**
 * 正方形に切って見せるとき（object-fit: cover）の object-position。ai_tags.crop の正方形が見えるようにする。
 *
 * crop は k11 で「一辺が写真の短辺の正方形を、蓋の枠の中心に寄せて」置いたもの。cover で正方形の枠に
 * 入れると見えるのは短辺の正方形なので、その位置を長辺方向の割合に直すだけでよい（画像は作らない）。
 * 横長なら x0 / (1 − 幅)、縦長なら y0 / (1 − 高さ)。crop が無い・形が違う・正方形の枠でない所では
 * undefined を返し、今までどおり真ん中になる。
 */
const unitBox = (value: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return null;
  const [x0, y0, x1, y1] = value as number[];
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
};

export function photoObjectPosition(aiTags: unknown): string | undefined {
  if (!isRecord(aiTags)) return undefined;
  const crop = aiTags.crop;
  if (!Array.isArray(crop) || crop.length !== 4) return undefined;
  if (!crop.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return undefined;
  const [x0, y0, x1, y1] = crop as number[];
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return undefined;
  const pct = (offset: number, size: number) =>
    size >= 0.999 ? 50 : Math.round(Math.min(Math.max(offset / (1 - size), 0), 1) * 1000) / 10;
  const x = pct(x0, w);
  const y = pct(y0, h);
  if (x === 50 && y === 50) return undefined;
  return `${x}% ${y}%`;
}

/** 蓋に合わせて拡大するときの最大倍率（一覧の正方形に対して）。320px のサムネイルを拡大するので、それ以上はぼやける */
export const LID_ZOOM_MAX = 3;

export type LidZoomStyle = {
  position: 'absolute';
  width: string;
  height: string;
  left: string;
  top: string;
  maxWidth: 'none';
};

/**
 * 丸いスタンプ（スタンプ帳の「集めたスタンプ」）で、蓋が丸をいっぱいに埋めるように写真を置く位置。
 * 正方形の枠（position: relative; overflow: hidden）の中に、img を absolute で大きく置く。
 *
 * ai_tags.lid（蓋の枠）の長いほうの辺 × 1.04 を枠の一辺にし、蓋の中心を枠の真ん中に合わせる。
 * 写真の縦横比は ai_tags.crop から分かる（crop は短辺の正方形なので、幅 = 短辺/W、高さ = 短辺/H）。
 * 小さい蓋は LID_ZOOM_MAX 倍まで（それ以上は蓋の周りも写る）。
 * lid か crop が無い・形が違うときは undefined（呼び出し側は今までどおり object-fit: cover）。
 */
export function photoLidZoom(aiTags: unknown, maxZoom = LID_ZOOM_MAX): LidZoomStyle | undefined {
  if (!isRecord(aiTags)) return undefined;
  const lid = unitBox(aiTags.lid);
  const crop = unitBox(aiTags.crop);
  if (!lid || !crop) return undefined;
  const aspect = (crop[3] - crop[1]) / (crop[2] - crop[0]); // W / H
  // 写真の幅を 1 とした長さで考える（高さは 1 / aspect）
  const height = 1 / aspect;
  const shortSide = Math.min(1, height);
  const lidW = lid[2] - lid[0];
  const lidH = (lid[3] - lid[1]) * height;
  const side = Math.max(Math.max(lidW, lidH) * 1.04, shortSide / maxZoom);
  const cx = (lid[0] + lid[2]) / 2;
  const cy = ((lid[1] + lid[3]) / 2) * height;
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  return {
    position: 'absolute',
    width: pct(1 / side),
    height: pct(height / side),
    left: pct(0.5 - cx / side),
    top: pct(0.5 - cy / side),
    maxWidth: 'none',
  };
}

/** AI が見つけた枠（蓋・ぬいぐるみ）。ぬいぐるみの特集でそれぞれ切り抜くのに使う。形が違う枠は null */
export function photoAiBoxes(aiTags: unknown): { lid: [number, number, number, number] | null; plush: [number, number, number, number] | null } {
  if (!isRecord(aiTags)) return { lid: null, plush: null };
  return { lid: unitBox(aiTags.lid), plush: unitBox(aiTags.plush_box) };
}

/**
 * 写真の中の1つの枠（蓋・ぬいぐるみ）だけを正方形の枠いっぱいに切り抜いて見せる位置。置き方は photoLidZoom と同じ
 * （正方形の枠の中に img を absolute で大きく置く）。枠の長いほうの辺 × pad を一辺にし、枠の中心を真ん中に合わせる
 * （写真の外が見えないよう、写真の端ではずらす。一辺は写真の短辺まで）。
 * 写真の縦横比は ai_tags.crop から分かる。maxZoom 倍（一覧の正方形に対して）まで。crop が無ければ undefined。
 * ぬいぐるみの特集で、蓋とぬいぐるみをそれぞれ切り抜いて並べるのに使う。
 */
export function photoBoxZoom(
  aiTags: unknown,
  box: [number, number, number, number],
  pad = 1.1,
  maxZoom = LID_ZOOM_MAX,
): LidZoomStyle | undefined {
  if (!isRecord(aiTags)) return undefined;
  const crop = unitBox(aiTags.crop);
  if (!crop) return undefined;
  const aspect = (crop[3] - crop[1]) / (crop[2] - crop[0]); // W / H
  const height = 1 / aspect;
  const shortSide = Math.min(1, height);
  // 写真の外（地の色）が見えないように、正方形は写真の短辺までにし、写真の内側にずらす
  const side = Math.min(Math.max(Math.max(box[2] - box[0], (box[3] - box[1]) * height) * pad, shortSide / maxZoom), shortSide);
  const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), Math.max(hi, 0));
  const left = clamp((box[0] + box[2]) / 2 - side / 2, 1 - side);
  const top = clamp(((box[1] + box[3]) / 2) * height - side / 2, height - side);
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  return {
    position: 'absolute',
    width: pct(1 / side),
    height: pct(height / side),
    left: pct(-left / side),
    top: pct(-top / side),
    maxWidth: 'none',
  };
}

/** ぬいぐるみの特集で、蓋とぬいぐるみをそれぞれ切り抜けるか（lid・plush_box・crop がそろっている） */
export function hasPlushClip(aiTags: unknown): boolean {
  const { lid, plush } = photoAiBoxes(aiTags);
  return Boolean(lid && plush && isRecord(aiTags) && unitBox(aiTags.crop));
}

/** 蓋の枠として信じる縦/横の範囲（ピクセルで）。avatarCropSquare */
export const LID_SANE_ASPECT: [number, number] = [0.65, 1.5];

export type PixelSquare = { left: number; top: number; width: number; height: number };

/**
 * アイコン（/api/photo/[id]/avatar）で写真から切り出す正方形（ピクセル）。丸く見せたとき蓋が丸をいっぱいに埋めるようにする。
 *
 * ai_tags.lid（蓋の枠）があれば、その長いほうの辺 × 1.04 を一辺にし、蓋の中心に合わせる（photoLidZoom と同じ寄せ方）。
 * 一辺は写真の短辺まで・短辺の 1/LID_ZOOM_MAX 以上（小さい蓋を拡大しすぎてぼやけさせない）。写真の外が入らないよう端ではずらす。
 * lid が無ければ一覧の正方形（ai_tags.crop）、それも無ければ真ん中の正方形。
 *
 * 蓋の枠がピクセルで見て正方形から大きく外れている（縦/横が LID_SANE_ASPECT の外）ときは、lid も
 * それから決めた crop も信用せず真ん中で切る。蓋は丸いので枠はほぼ正方形（斜めから撮ると横長になる程度）。
 * 2026-11 の点検で、縦/横が (4/3)² ≈ 1.78 や (3/4)² ≈ 0.56 の枠が1割弱あった（採点が写真を 90° 回った向きで見た跡）。
 */
export function avatarCropSquare(aiTags: unknown, width: number, height: number): PixelSquare {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const short = Math.min(W, H);
  let lid = isRecord(aiTags) ? unitBox(aiTags.lid) : null;
  let crop = isRecord(aiTags) ? unitBox(aiTags.crop) : null;
  if (lid) {
    const ratio = ((lid[3] - lid[1]) * H) / ((lid[2] - lid[0]) * W);
    if (ratio < LID_SANE_ASPECT[0] || ratio > LID_SANE_ASPECT[1]) {
      lid = null;
      crop = null;
    }
  }
  let side = short;
  let cx = W / 2;
  let cy = H / 2;
  if (lid) {
    side = Math.max((lid[2] - lid[0]) * W, (lid[3] - lid[1]) * H) * 1.04;
    side = Math.min(Math.max(side, short / LID_ZOOM_MAX), short);
    cx = ((lid[0] + lid[2]) / 2) * W;
    cy = ((lid[1] + lid[3]) / 2) * H;
  } else if (crop) {
    cx = ((crop[0] + crop[2]) / 2) * W;
    cy = ((crop[1] + crop[3]) / 2) * H;
  }
  const s = Math.max(1, Math.min(Math.round(side), short));
  const clamp = (v: number, hi: number) => Math.min(Math.max(Math.round(v), 0), hi);
  return { left: clamp(cx - s / 2, W - s), top: clamp(cy - s / 2, H - s), width: s, height: s };
}
