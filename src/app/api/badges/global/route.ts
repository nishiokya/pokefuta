import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/badges/global
 * ユーザーのグローバルバッジ（全都道府県制覇）情報を取得
 * 
 * Response:
 * {
 *   isComplete: boolean,
 *   completedAt: string | null,
 *   outdatedAt: string | null,
 *   activeCount: number,
 *   totalCount: number,
 *   remainingPrefectures: Array<string>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's app_user record
    const { data: userData, error: userError } = await supabase
      .from('app_user')
      .select('all_prefectures_completed_at, all_prefectures_outdated_at')
      .eq('auth_uid', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return NextResponse.json(
        { error: userError.message },
        { status: 500 }
      );
    }

    // Get badge summary
    const { data: badges, error: badgeError } = await supabase
      .from('prefecture_completion_tracker')
      .select('prefecture_id, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'outdated']);

    if (badgeError) {
      console.error('Error fetching badges:', badgeError);
      return NextResponse.json(
        { error: badgeError.message },
        { status: 500 }
      );
    }

    const activeCount = (badges || []).filter((b) => b.status === 'active').length;
    const completedPrefectureIds = new Set(
      (badges || []).map((b) => b.prefecture_id)
    );

    // Get list of remaining prefectures
    const { data: allPrefectures, error: prefError } = await supabase
      .from('prefecture')
      .select('id, name')
      .order('display_order', { ascending: true });

    if (prefError) {
      console.error('Error fetching prefectures:', prefError);
      return NextResponse.json(
        { error: prefError.message },
        { status: 500 }
      );
    }

    const remainingPrefectures = (allPrefectures || [])
      .filter((p) => !completedPrefectureIds.has(p.id))
      .map((p) => p.name);

    const isComplete =
      activeCount === 47 && userData?.all_prefectures_completed_at !== null;

    return NextResponse.json({
      isComplete,
      completedAt: userData?.all_prefectures_completed_at || null,
      outdatedAt: userData?.all_prefectures_outdated_at || null,
      activeCount,
      totalBadges: badges?.length || 0,
      totalPrefectures: 47,
      remainingCount: 47 - activeCount,
      remainingPrefectures,
      status: isComplete ? 'complete' : userData?.all_prefectures_outdated_at ? 'outdated' : 'in-progress',
    });
  } catch (error) {
    console.error('Unexpected error in global badge API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
