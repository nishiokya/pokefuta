import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const photoId = params.id;
    const { searchParams } = new URL(request.url);
    const size = searchParams.get('size'); // 'small', 'medium', 'large', or null for original

    // Fetch photo metadata from database
    const { data: photo, error } = await supabase
      .from('photo')
      .select('*')
      .eq('id', photoId)
      .single();

    if (error || !photo) {
      return NextResponse.json({
        success: false,
        error: 'Photo not found'
      }, { status: 404 });
    }

    // Determine which storage key to use based on size
    let storageKey = photo.storage_key;

    // For now, we don't have separate thumbnails, so just use the main image
    // TODO: Generate and store thumbnails

    // Get signed URL from storage provider
    const signedUrl = await storage.getSignedUrl(storageKey, 3600); // 1 hour expiry

    // Redirect to the signed URL
    return NextResponse.redirect(signedUrl.url);

  } catch (error: any) {
    console.error('Error fetching photo:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch photo',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
