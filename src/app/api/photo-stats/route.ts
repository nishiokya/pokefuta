import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Get photo count from photo table
    let photoTableCount = 0;
    let photoTableExists = false;

    try {
      const { data: photos, error: photoError } = await supabase
        .from('photo')
        .select('id')
        .limit(1000); // Get up to 1000 to count

      if (!photoError && photos) {
        photoTableCount = photos.length;
        photoTableExists = true;
      }
    } catch (error) {
      console.log('Photo table not accessible');
    }

    return NextResponse.json({
      success: true,
      photo_count: photoTableCount,
      sources: {
        photo_table: photoTableCount
      },
      message: `Found ${photoTableCount} photos in database`
    });

  } catch (error: any) {
    console.error('Photo stats error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get photo statistics',
      details: error?.message || 'Unknown error',
      photo_count: 0
    }, { status: 500 });
  }
}