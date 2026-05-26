import { NextRequest, NextResponse } from 'next/server';
import { loadPublicUserPrefectureProgress } from '@/lib/user-prefecture-progress';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: {
    userId: string;
  };
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const progress = await loadPublicUserPrefectureProgress(params.userId);

    if (!progress) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: progress.userId,
        displayName: progress.displayName,
      },
      summary: {
        completedPrefectureCount: progress.completedPrefectureCount,
        totalPrefectureCount: progress.totalPrefectureCount,
        visitedManholeCount: progress.visitedManholeCount,
        totalManholeCount: progress.totalManholeCount,
        completionRate: progress.completionRate,
      },
      prefectures: progress.prefectures,
    });
  } catch (error) {
    console.error('Failed to load public user prefecture progress:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load user prefecture progress',
      },
      { status: 500 }
    );
  }
}

