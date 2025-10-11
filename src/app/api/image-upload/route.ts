import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage, generateStorageKey } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // ✅ 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const manholeId = formData.get('manhole_id');
    const shotAt = formData.get('shot_at');
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

    // Generate storage key for R2
    const storageKey = generateStorageKey('original');

    // Upload to R2 storage
    await storage.put(storageKey, arrayBuffer, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    console.log(`File uploaded successfully to storage: ${storageKey}`);

    // Get signed URL for the uploaded file
    const signedUrl = await storage.getSignedUrl(storageKey, 3600); // 1 hour

    // Create visit and image records
    let visitId: string | null = null;
    let imageId: string | null = null;

    try {
      // ✅ 強制的にログインユーザーのIDを使用
      const userId = session.user.id;
      console.log('Creating visit with user_id:', userId);

      // Parse shot_at timestamp properly - convert to Date object for PostgreSQL
      let shotAtDate: Date;
      if (shotAt) {
        shotAtDate = new Date(shotAt as string);
        // Validate date
        if (isNaN(shotAtDate.getTime())) {
          shotAtDate = new Date(); // Fallback to current time
        }
      } else {
        shotAtDate = new Date();
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

      // Create visit record with proper Date type
      console.log('Creating visit record. userId:', userId, 'shot_at:', shotAtDate.toISOString());

      const visitInsert: any = {
        user_id: userId,  // ✅ 必ず自分のID
        shot_at: shotAtDate, // Pass Date object, not string
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
        console.error('Failed to create visit record:', visitError?.message);
        throw new Error(`Visit creation failed: ${visitError?.message}`);
      }

      // Create photo record with minimal required fields
      // Note: Adjust fields based on actual database schema
      const photoInsert: any = {
        visit_id: visitId,
        storage_key: storageKey,
      };

      // Add optional fields if they exist in schema
      if (fileSize) photoInsert.file_size = fileSize;
      if (file.type) photoInsert.content_type = file.type;
      if (file.name) photoInsert.original_name = file.name;

      const { data: photoData, error: photoError } = await supabase
        .from('photo')
        .insert(photoInsert)
        .select()
        .single();

      if (!photoError && photoData) {
        imageId = photoData.id;
        console.log('Successfully stored photo metadata in database:', imageId);
      } else {
        console.error('Photo insert failed:', photoError?.message);
        throw new Error(`Photo creation failed: ${photoError?.message}`);
      }

    } catch (dbError: any) {
      console.error('Database operation failed:', dbError?.message);
      return NextResponse.json({
        success: false,
        error: 'Database operation failed',
        details: dbError?.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Image uploaded successfully',
      visit_id: visitId,
      image: {
        id: imageId,
        filename: file.name,
        content_type: file.type,
        file_size: fileSize,
        storage_key: storageKey,
        uploaded_at: new Date().toISOString(),
        url: signedUrl.url,
        expires_at: signedUrl.expiresAt,
      },
      storage_provider: process.env.STORAGE_PROVIDER || 'r2',
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
      // Return list of uploaded photos from database
      const { data: images, error } = await supabase
        .from('photo')
        .select(`
          *,
          visit!inner(
            id,
            user_id,
            shot_at,
            manhole_id,
            note
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch images',
          details: error.message
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Images retrieved successfully',
        images: images || [],
        count: images?.length || 0,
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