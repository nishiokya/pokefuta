/**
 * 写真に付いた AI の判定タグ（photo.ai_tags）から、写真館に出すタグを決める。
 *
 * ai_tags は k11 の manhole-score が毎朝の採点で書く（supabase/migrations/20261004100000_photo_ai_tags.sql）。
 * アプリは判定しない。ここは「どれを出すか」だけを決める。
 *
 * 出すのは3つ:
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
  night?: boolean | null;
};

export type AiTagKey = 'plush' | 'night' | 'landscape';

/** ai: AI が写真から判定したか（「AI」の印を付ける）。夜は撮影時刻と場所から決まるので false */
export type AiTag = { key: AiTagKey; label: string; ai: boolean };

// チップには「AI」の印を付けない（かっこ悪いという利用者の声）。代わりにタグの下にこの注釈を出す
export const AI_TAG_HELP = 'タグは AI で自動判定しています。間違っていたらごめんなさい。';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function photoAiTags(photo: { ai_tags?: unknown; is_landscape?: boolean | null }): AiTag[] {
  const tags = photo.ai_tags;
  if (!isRecord(tags)) return [];
  const out: AiTag[] = [];
  if (tags.plush === true) out.push({ key: 'plush', label: 'ぬいぐるみ', ai: true });
  if (tags.night === true) out.push({ key: 'night', label: '夜', ai: false });
  if (tags.scene === 'landscape' && !photo.is_landscape) out.push({ key: 'landscape', label: '風景', ai: true });
  return out;
}
