import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { loadCachedManholes } from '@/lib/manhole-snapshot';
import type { Database, ManholeTitle } from '@/types/database';

// クッキーを読まない（#275）と静的ルート扱いになり、ビルド時の結果で固まりうる
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type RarePreviewManhole = {
  id: number;
  prefecture: string | null;
  municipality: string | null;
  title: string | null;
  pokemons: string[] | null;
  titles: ManholeTitle[] | null;
};

const SELECT_FIELDS = 'id, prefecture, municipality, title, pokemons, titles';
const PREVIEW_TITLE_KEYS = [
  'north_end',
  'south_end',
  'east_end',
  'west_end',
  'unique_pokemon',
  'rare_pokemon',
  'remote_island',
  'only_in_pref',
];

const getTopTitlePriority = (titles?: ManholeTitle[] | null) =>
  Math.max(...(Array.isArray(titles) ? titles.map((title) => title.priority ?? 0) : [0]));

/**
 * 称号のある蓋。図鑑のスナップショット（data.pokefuta.com、日次）から作り、取れなければ Supabase から読む。
 * 3枚出すために全件（約270KB）を読むので、以前は1日 約150回で 40MB を Supabase から出していた。
 */
async function loadTitledManholes(): Promise<RarePreviewManhole[]> {
  const snapshot = await loadCachedManholes();
  if (snapshot && snapshot.length > 0) {
    return snapshot
      .filter((m) => Array.isArray(m.title_tags) && m.title_tags.some((tag) => PREVIEW_TITLE_KEYS.includes(tag as string)))
      .sort((a, b) => a.id - b.id)
      .map((m) => ({
        id: m.id,
        prefecture: m.prefecture ?? null,
        municipality: m.municipality ?? null,
        title: m.title ?? null,
        pokemons: Array.isArray(m.pokemons) ? m.pokemons : null,
        titles: Array.isArray(m.titles) ? m.titles : null,
      }));
  }

  // 共有キャッシュする応答なのでクッキーを読まない（anon.ts 参照）
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from('manhole')
    .select(SELECT_FIELDS)
    .overlaps('title_tags', PREVIEW_TITLE_KEYS)
    .order('id', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as RarePreviewManhole[];
}

export async function GET() {
  try {
    const manholes = (await loadTitledManholes())
      .filter((manhole) => Array.isArray(manhole.titles) && manhole.titles.length > 0)
      .sort((a, b) => getTopTitlePriority(b.titles) - getTopTitlePriority(a.titles))
      .slice(0, 3);

    return NextResponse.json(
      {
        success: true,
        manholes,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        manholes: [],
        error: 'Failed to get rare manhole preview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
