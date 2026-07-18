import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { storage } from '@/lib/storage';
import type { Database, ManholeTitle } from '@/types/database';

export type ManholeForOgp = {
  id: number;
  title: string;
  prefecture: string;
  municipality: string | null;
  pokemons: string[];
  titles: ManholeTitle[];
};

export type PhotoForOgp = {
  id: string;
  storage_key: string;
  signed_url?: string;
};

export function createOgpSupabaseClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const keys = [serviceRoleKey, anonKey].filter((key): key is string => Boolean(key));

  if (!url || keys.length === 0) return [];

  return keys.map((key) => createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }));
}

export async function loadManholeForOgp(id: number): Promise<ManholeForOgp | null> {
  const clients = createOgpSupabaseClients();

  for (const supabase of clients) {
    const { data, error } = await supabase
      .from('manhole')
      .select('id, title, prefecture, municipality, pokemons, titles')
      .eq('id', id)
      .single();

    if (error || !data) continue;

    const row = data as any;
    return {
      id: row.id,
      title: row.title,
      prefecture: row.prefecture,
      municipality: row.municipality ?? null,
      pokemons: Array.isArray(row.pokemons) ? row.pokemons : [],
      titles: Array.isArray(row.titles) ? row.titles : [],
    };
  }

  return null;
}

export async function loadPhotoForOgp(
  photoId: string,
  manholeId: number,
  options: { includeSignedUrl?: boolean } = {}
): Promise<PhotoForOgp | null> {
  const clients = createOgpSupabaseClients();

  for (const supabase of clients) {
    const { data, error } = await supabase
      .from('photo')
      .select('id, storage_key, visit:visit_id (is_public), manhole_id')
      .eq('id', photoId)
      .eq('manhole_id', manholeId)
      .single();

    if (error || !data) continue;

    const row = data as any;
    const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;

    if (!visit?.is_public) continue;

    const photo: PhotoForOgp = {
      id: row.id,
      storage_key: row.storage_key,
    };

    if (options.includeSignedUrl) {
      try {
        const signed = await storage.getSignedUrl(photo.storage_key, 3600);
        photo.signed_url = signed.url;
      } catch {
        // signed URL failure is non-fatal; caller must check
      }
    }

    return photo;
  }

  return null;
}

export async function loadFirstPublicPhotoForManhole(
  manholeId: number,
  options: { includeSignedUrl?: boolean } = {}
): Promise<PhotoForOgp | null> {
  const clients = createOgpSupabaseClients();

  for (const supabase of clients) {
    const { data, error } = await supabase
      .from('photo')
      .select('id, storage_key, visit:visit_id (is_public)')
      .eq('manhole_id', manholeId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) continue;

    const publicRow = (data as any[]).find((row) => {
      const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
      return visit?.is_public === true;
    });

    if (!publicRow) continue;

    const photo: PhotoForOgp = {
      id: publicRow.id,
      storage_key: publicRow.storage_key,
    };

    if (options.includeSignedUrl) {
      try {
        const signed = await storage.getSignedUrl(photo.storage_key, 3600);
        photo.signed_url = signed.url;
      } catch {
        // signed URL failure is non-fatal
      }
    }

    return photo;
  }

  return null;
}
