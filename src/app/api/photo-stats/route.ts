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

    // Get count from in-memory minimal-upload storage
    let minimalUploadCount = 0;
    try {
      const minimalUploadResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/minimal-upload`);
      if (minimalUploadResponse.ok) {
        const uploadData = await minimalUploadResponse.json();
        if (uploadData.success && uploadData.count) {
          minimalUploadCount = uploadData.count;
        }
      }
    } catch (error) {
      console.log('Minimal upload API not accessible');
    }

    // Use the maximum count (since some photos might be in both)
    const photoCount = Math.max(photoTableCount, minimalUploadCount);

    return NextResponse.json({
      success: true,
      photo_count: photoCount,
      sources: {
        photo_table: photoTableCount,
        minimal_upload: minimalUploadCount
      },
      message: `Found ${photoCount} photos total (${photoTableCount} in DB, ${minimalUploadCount} in memory)`
    });

  } catch (error) {
    console.error('Photo stats error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get photo statistics',
      details: error.message,
      photo_count: 0
    }, { status: 500 });
  }
}