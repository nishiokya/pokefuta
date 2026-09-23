import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { buildPrefectureCompletionFromAggregates } from '@/lib/prefecture-completion';

/**
 * 都道府県ごとの現地写真コンプリート状況。
 *
 * 公開写真だけを数える集計RPCを入力にする。旧スナップショットの photo_count は
 * 非公開写真も含むため、写真館では見えない写真だけの蓋まで「写真あり」になっていた。
 *
 * force-dynamic が無いとビルド時に静的プリレンダーされ、Amplify では
 * デプロイ時点の値で凍結する（/api/site-stats と同じ事故）。
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

export async function GET() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await supabase.rpc('get_public_prefecture_completion');

  if (error || !data) {
    console.error('get_public_prefecture_completion failed:', error?.message);
    return NextResponse.json(
      { success: false, error: 'completion_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const rollup = buildPrefectureCompletionFromAggregates(data);

  return NextResponse.json(
    {
      success: true,
      generated_at: new Date().toISOString(),
      ...rollup,
    },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
