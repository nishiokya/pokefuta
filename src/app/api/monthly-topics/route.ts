import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { buildMonthlyTopics, type TopicManhole, type TopicPhoto } from '@/lib/monthly-topics';

/**
 * トップのヒーローの「◯月の話題」（src/lib/monthly-topics.ts）。
 *
 * 「初めて」「◯か月ぶり」を判定するには過去の写真がすべて要るので、公開写真を全件読む
 * （2026-10 で約2300枚。PostgREST は1回1000行までなのでページを分ける）。
 * 話題は月単位で変わるだけなので CDN に1時間置く。anon キーで読むので、返るのは RLS が許す公開訪問の写真だけ。
 * 投稿者（visit.user_id）は人数を数えるためだけに使い、応答には入れない。
 *
 * force-dynamic が無いとビルド時に静的プリレンダーされ、Amplify ではデプロイ時点の値で凍結する（/api/site-stats と同じ事故）。
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
const PAGE_SIZE = 1000;
/** 暴走よけ。2万枚を超えたら集計の置き場所（RPC・日次の静的 JSON）を考え直す */
const MAX_PAGES = 20;

const unavailable = () =>
  NextResponse.json(
    { success: false, error: 'topics_unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );

export async function GET() {
  const supabase = createAnonClient();

  const photos: TopicPhoto[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('photo')
      .select('id, created_at, manhole_id, visit:visit_id!inner (user_id, shot_at, is_public)')
      .eq('visit.is_public', true)
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error || !data) {
      console.error('monthly-topics: photo query failed:', error?.message);
      return unavailable();
    }
    for (const row of data as any[]) {
      const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
      if (!visit?.is_public || typeof row.manhole_id !== 'number' || !visit.user_id) continue;
      photos.push({ manholeId: row.manhole_id, takenAt: visit.shot_at ?? row.created_at, posterKey: visit.user_id });
    }
    if (data.length < PAGE_SIZE) break;
  }

  const { data: manholeRows, error: manholeError } = await supabase
    .from('manhole')
    .select('id, prefecture, municipality')
    .limit(PAGE_SIZE);
  if (manholeError || !manholeRows) {
    console.error('monthly-topics: manhole query failed:', manholeError?.message);
    return unavailable();
  }

  const result = buildMonthlyTopics(photos, manholeRows as TopicManhole[], new Date());
  return NextResponse.json(
    { success: true, ...(result ?? { year: null, month: null, topics: [] }) },
    { headers: { 'Cache-Control': CACHE_CONTROL } },
  );
}
