import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await createAnonClient().rpc('get_home_gift_manholes');
  if (error) {
    console.warn('Failed to load home gift manholes:', error);
    return NextResponse.json({ manholes: [] }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json({ manholes: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=30' },
  });
}
