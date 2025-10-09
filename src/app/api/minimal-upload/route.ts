import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage, generateStorageKey } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Get user session (optional - can be used without auth for demo)
    const { data: { session } } = await supabase.auth.getSession();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const manholeId = formData.get('manhole_id');
    const shotAt = formData.get('shot_at') || new Date().toISOString();
    const note = formData.get('note');
    const shotLocation = formData.get('shot_location');
    const latitude = formData.get('latitude');
    const longitude = formData.get('longitude');

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({
        success: false,
        error: 'File must be an image'
      }, { status: 400 });
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    // Generate storage key
    const storageKey = generateStorageKey('original');

    // Upload to storage (R2 or Supabase depending on STORAGE_PROVIDER env var)
    await storage.put(storageKey, arrayBuffer, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    console.log(`File uploaded successfully to storage: ${storageKey}`);

    // Get signed URL for the uploaded file
    const signedUrl = await storage.getSignedUrl(storageKey, 3600); // 1 hour

    // Create visit record first
    let visitId: string | null = null;
    let photoId: string | null = null;

    try {
      // Create or find user (for demo purposes, create fallback user if not authenticated)
      let userId: string | null = session?.user?.id || null;

      if (!userId) {
        // Use fallback user ID directly
        userId = 'e67889cd-a51e-4e08-aa00-73acaaa788d4';
        console.log('Using fallback user:', userId);
      }

      // Build shot_location as PostGIS POINT if coordinates are provided
      let shotLocationGeom = shotLocation as string | null;
      if (latitude && longitude) {
        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        if (!isNaN(lat) && !isNaN(lng)) {
          shotLocationGeom = `POINT(${lng} ${lat})`;
        }
      }

      // Create visit record
      if (userId) {
        const visitInsert: any = {
          user_id: userId,
          shot_at: shotAt as string,
          with_family: false, // Required field with default
        };

        // Add optional fields only if they exist in schema
        if (manholeId) {
          visitInsert.manhole_id = parseInt(manholeId as string);
        }
        if (shotLocationGeom) {
          visitInsert.shot_location = shotLocationGeom;
        }
        if (note) {
          visitInsert.note = note as string;
        }

        const { data: visitData, error: visitError } = await supabase
          .from('visit')
          .insert(visitInsert)
          .select()
          .single();

        if (!visitError && visitData) {
          visitId = visitData.id;
          console.log('Successfully created visit record:', visitId);
        } else {
          console.log('Failed to create visit record:', visitError?.message);
        }
      }

      // Create photo record linked to visit
      // Note: Using actual database column names (storage_path instead of storage_key)
      const photoInsert: any = {
        visit_id: visitId,
        storage_path: storageKey,  // Database uses 'storage_path' not 'storage_key'
        file_size: fileSize,
        content_type: file.type,
      };

      const { data: photoData, error: photoError } = await supabase
        .from('photo')
        .insert(photoInsert)
        .select()
        .single();

      if (!photoError && photoData) {
        photoId = photoData.id;
        console.log('Successfully stored photo metadata in database:', photoId);
      } else {
        console.log('Database insert failed:', photoError?.message);
      }
    } catch (dbError: any) {
      console.log('Database storage failed:', dbError?.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Image uploaded successfully',
      visit_id: visitId,
      image: {
        id: photoId || storageKey,
        filename: file.name,
        content_type: file.type,
        file_size: fileSize,
        storage_key: storageKey,
        uploaded_at: new Date().toISOString(),
        url: signedUrl.url,
        expires_at: signedUrl.expiresAt,
      },
      storage_provider: process.env.STORAGE_PROVIDER || 'supabase',
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during upload',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { searchParams } = new URL(request.url);
    const storageKey = searchParams.get('key');

    if (storageKey) {
      // Redirect to signed URL for the specific image
      const signedUrl = await storage.getSignedUrl(storageKey, 3600);

      return NextResponse.redirect(signedUrl.url);
    } else {
      // Return list of uploaded images from database
      const { data: photos, error } = await supabase
        .from('photo')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch photos',
          details: error.message
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Images retrieved successfully',
        images: photos || [],
        count: photos?.length || 0,
      });
    }

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to get image',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}