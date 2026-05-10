import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/badges/prefectures
 * ユーザーの都道府県バッジ情報を取得
 * 
 * Query parameters:
 * - userId (optional): ユーザーID。指定なしの場合は認証ユーザー
 * - includeOutdated (boolean): 古いバッジも含めるか（デフォルト: true）
 * 
 * Response:
 * {
 *   badges: Array<{
 *     badgeId, userId, prefectureId, code, name, status,
 *     totalManholes, visitedCount, completionPercentage,
 *     acquiredAt, outdatedAt
 *   }>,
 *   globalBadge: {
 *     completedAt: string | null,
 *     outdatedAt: string | null,
 *     totalActiveCount: number
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;
    const includeOutdated = searchParams.get('includeOutdated') !== 'false';

    // Get prefecture badges from the tracker view
    let query = supabase
      .from('prefecture_completion_tracker')
      .select(`
        badge_id,
        user_id,
        prefecture_id,
        code,
        name,
        name_en,
        status,
        total_manholes_now,
        visited_manholes_count,
        current_completion_percentage,
        acquired_at,
        outdated_at,
        manhole_count_at_completion,
        visited_manhole_count,
        completion_percentage
      `)
      .eq('user_id', userId);

    // Filter by status if needed
    if (!includeOutdated) {
      query = query.eq('status', 'active');
    }

    const { data: trackerData, error: trackerError } = await query;

    if (trackerError) {
      console.error('Error fetching prefecture badges:', trackerError);
      return NextResponse.json(
        { error: trackerError.message },
        { status: 500 }
      );
    }

    // Get user's global badge status
    const { data: userData, error: userError } = await supabase
      .from('app_user')
      .select('all_prefectures_completed_at, all_prefectures_outdated_at')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user badge status:', userError);
      return NextResponse.json(
        { error: userError.message },
        { status: 500 }
      );
    }

    // Count active badges
    const activeCount = (trackerData || []).filter(
      (badge) => badge.status === 'active'
    ).length;

    // Format response
    const badges = (trackerData || []).map((row) => ({
      badgeId: row.badge_id,
      userId: row.user_id,
      prefectureId: row.prefecture_id,
      code: row.code,
      name: row.name,
      nameEn: row.name_en,
      status: row.status || 'none', // 'active' | 'outdated' | 'none'
      totalManholes: row.total_manholes_now,
      visitedCount: row.visited_manholes_count,
      currentCompletion: row.current_completion_percentage,
      acquiredAt: row.acquired_at,
      outdatedAt: row.outdated_at,
      // Snapshot at badge acquisition
      snapshotTotalManholes: row.manhole_count_at_completion,
      snapshotVisitedCount: row.visited_manhole_count,
      snapshotCompletion: row.completion_percentage,
    }));

    const globalBadge = {
      completedAt: userData?.all_prefectures_completed_at || null,
      outdatedAt: userData?.all_prefectures_outdated_at || null,
      totalActiveCount: activeCount,
      isComplete: activeCount === 47,
    };

    return NextResponse.json({
      badges,
      globalBadge,
      summary: {
        total: badges.length,
        active: activeCount,
        outdated: badges.filter((b) => b.status === 'outdated').length,
        unearned: 47 - badges.length,
      },
    });
  } catch (error) {
    console.error('Unexpected error in prefecture badges API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/badges/prefectures/check
 * ユーザーが指定都道府県の全マンホール訪問したかチェック＆バッジ作成
 * 
 * Body:
 * {
 *   prefectureId: number
 * }
 * 
 * Response:
 * {
 *   badgeCreated: boolean,
 *   badgeId: string | null,
 *   completionPercentage: number,
 *   message: string
 * }
 */
export async function POST(request: NextRequest) {
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

    const { prefectureId } = await request.json();

    if (!prefectureId || typeof prefectureId !== 'number') {
      return NextResponse.json(
        { error: 'Invalid prefectureId' },
        { status: 400 }
      );
    }

    // Call the function to create badge
    const { data: result, error: functionError } = await supabase.rpc(
      'create_prefecture_badge',
      {
        p_user_id: user.id,
        p_prefecture_id: prefectureId,
      }
    );

    if (functionError) {
      console.error('Error creating prefecture badge:', functionError);
      return NextResponse.json(
        { error: functionError.message },
        { status: 500 }
      );
    }

    const badgeCreated = result !== null;

    // Get updated completion data
    const { data: prefData } = await supabase
      .from('prefecture_completion_tracker')
      .select('current_completion_percentage, status')
      .eq('user_id', user.id)
      .eq('prefecture_id', prefectureId)
      .single();

    return NextResponse.json({
      badgeCreated,
      badgeId: result,
      completionPercentage: prefData?.current_completion_percentage || 0,
      message: badgeCreated
        ? `Badge created for prefecture ${prefectureId}!`
        : 'Not all manholes visited yet.',
    });
  } catch (error) {
    console.error('Unexpected error in badge check API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
