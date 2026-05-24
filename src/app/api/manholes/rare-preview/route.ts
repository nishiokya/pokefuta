import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
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
    const supabase = createRouteHandlerClient<Database>({ cookies });

    const results = await Promise.all(
      PREVIEW_TITLE_KEYS.map((key) =>
        supabase
          .from('manhole')
          .select(SELECT_FIELDS)
          .contains('title_tags', [key])
          .order('id', { ascending: true })
          .limit(3)
      )
    );

    const error = results.find((result) => result.error)?.error;

    if (error) {
      throw new Error(error.message);
    }

    const byId = new Map<number, RarePreviewManhole>();
    results.forEach((result) => {
      ((result.data ?? []) as RarePreviewManhole[]).forEach((manhole) => {
        byId.set(manhole.id, manhole);
      });
    });

    const manholes = Array.from(byId.values())
      .filter((manhole) => Array.isArray(manhole.titles) && manhole.titles.length > 0)
      .sort((a, b) => getTopTitlePriority(b.titles) - getTopTitlePriority(a.titles))
      .slice(0, 3);

    return NextResponse.json({
      success: true,
      manholes,
    });
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
