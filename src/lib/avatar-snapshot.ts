/**
 * 図鑑の `/api/avatars.json`（公開ID → アイコンの写真ID）を読む。
 *
 * pokefuta-tracker の日次ジョブ（export_app_snapshot.py の build_avatars、毎朝 05:30 JST）が、
 * 写真館の /profile で選んだ公開写真を書き出している。形:
 *   { "success": true, "generated_at": "…", "avatars": { "<公開ID>": "<写真ID>" } }
 *
 * 写真館は投稿者のアイコンを RPC get_public_avatar_photo_id で1人ずつ引いていて、
 * 1日 約1.2万回 Supabase へ出ていた（2026-11-23 の edge_logs）。表に無い人は「アイコン未設定」。
 * 日次なので、選び直したアイコンが他の人の画面に出るのは翌日から。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** avatars.json の中身を [公開ID（小文字）, 写真ID] の組にする。形が違えば null */
export function parseAvatarSnapshot(data: unknown): Array<[string, string]> | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { success?: unknown; avatars?: unknown };
  if (body.success !== true) return null;
  if (!body.avatars || typeof body.avatars !== 'object' || Array.isArray(body.avatars)) return null;
  const entries: Array<[string, string]> = [];
  for (const [publicId, photoId] of Object.entries(body.avatars as Record<string, unknown>)) {
    if (!UUID_RE.test(publicId)) continue;
    if (typeof photoId !== 'string' || !UUID_RE.test(photoId)) continue;
    entries.push([publicId.toLowerCase(), photoId]);
  }
  return entries;
}

/** 頼まれた公開ID それぞれのアイコン（無ければ null）。公開ID は小文字で引く */
export function avatarsFor(
  ids: string[],
  entries: Array<[string, string]>
): Record<string, string | null> {
  const map = new Map(entries);
  return Object.fromEntries(ids.map((id) => [id, map.get(id.toLowerCase()) ?? null]));
}
