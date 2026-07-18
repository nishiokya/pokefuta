import 'server-only';
import { createOgpSupabaseClients } from '@/lib/manhole-ogp';
import { storage } from '@/lib/storage';
import type { DesignManhole } from '@/types/database';

// storage_key はサーバー内でのみ使い、クライアントへは渡さないこと
export type DesignManholeForOgp = {
  id: string;
  title: string | null;
  description: string | null;
  submitter_name: string | null;
  latitude: number;
  longitude: number;
  width: number | null;
  height: number | null;
  created_at: string;
  storage_key: string;
  signed_url?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDesignManholeId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

// 一覧ページのSSR用。/api/design-manholes GET と同じ公開カラムのみを返す
// （exif / storage_key / created_by は絶対に含めない）
// 全クライアントで失敗した場合は throw する。空配列を返すと障害時に
// 「まだ投稿がありません」と誤表示してしまうため、失敗と0件を区別する
export async function loadPublishedDesignManholes(limit = 200): Promise<DesignManhole[]> {
  const clients = createOgpSupabaseClients();
  let lastError: unknown = new Error('Supabase client is not configured');

  for (const supabase of clients) {
    const { data, error } = await supabase
      .from('design_manhole')
      .select('id, title, description, submitter_name, latitude, longitude, width, height, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      lastError = error ?? lastError;
      continue;
    }

    return (data as any[]).map((row) => ({
      ...row,
      photo_url: `/api/design-manholes/${row.id}/photo?size=small`,
    }));
  }

  throw lastError;
}

export async function loadDesignManholeForOgp(
  id: string,
  options: { includeSignedUrl?: boolean } = {}
): Promise<DesignManholeForOgp | null> {
  if (!isValidDesignManholeId(id)) return null;

  const clients = createOgpSupabaseClients();

  for (const supabase of clients) {
    // hidden 化した投稿は個別ページ・OGPとも 404 にする（photo route と同方針）
    const { data, error } = await supabase
      .from('design_manhole')
      .select('id, title, description, submitter_name, latitude, longitude, width, height, created_at, storage_key')
      .eq('id', id)
      .eq('status', 'published')
      .single();

    if (error || !data) continue;

    const row = data as any;
    const designManhole: DesignManholeForOgp = {
      id: row.id,
      title: row.title ?? null,
      description: row.description ?? null,
      submitter_name: row.submitter_name ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      width: row.width ?? null,
      height: row.height ?? null,
      created_at: row.created_at,
      storage_key: row.storage_key,
    };

    if (options.includeSignedUrl) {
      try {
        const signed = await storage.getSignedUrl(designManhole.storage_key, 3600);
        designManhole.signed_url = signed.url;
      } catch {
        // signed URL failure is non-fatal; caller must check
      }
    }

    return designManhole;
  }

  return null;
}
