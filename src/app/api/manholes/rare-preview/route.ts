import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import type { Database, ManholeTitle } from '@/types/database';

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

export async function GET() {
  try {
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

    const manholes = ((data ?? []) as RarePreviewManhole[])
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
