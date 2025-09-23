import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

// Simple in-memory storage for demo purposes
const uploadedImages: Array<{
  id: string;
  filename: string;
  contentType: string;
  size: number;
  base64Data: string;
  uploadedAt: string;
}> = [];

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

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

    // Convert to base64 for storage
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');

    // Create image record
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const imageRecord = {
      id: imageId,
      filename: file.name,
      contentType: file.type,
      size: fileSize,
      base64Data: base64Data,
      uploadedAt: new Date().toISOString()
    };

    // Store in memory for immediate access
    uploadedImages.push(imageRecord);

    // Try to store in photo table for persistence (if it exists)
    try {
      // First check if photo table exists and get its structure
      const { data: existingPhotos, error: checkError } = await supabase
        .from('photo')
        .select('*')
        .limit(1);

      if (checkError) {
        console.log('Photo table not accessible:', checkError.message);
      } else {
        console.log('Photo table exists, found', existingPhotos?.length || 0, 'existing photos');

        // Try a minimal insert (photo table might have different required fields)
        const { data: photoData, error: photoError } = await supabase
          .from('photo')
          .insert({})
          .select()
          .single();

        if (!photoError && photoData) {
          console.log('Successfully stored photo metadata in database:', photoData.id);
        } else {
          console.log('Database insert failed:', photoError?.message);
        }
      }
    } catch (dbError) {
      console.log('Database storage failed, using in-memory only:', dbError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Image uploaded successfully',
      image: {
        id: imageRecord.id,
        filename: imageRecord.filename,
        content_type: imageRecord.contentType,
        file_size: imageRecord.size,
        uploaded_at: imageRecord.uploadedAt,
        url: `/api/minimal-upload?id=${imageRecord.id}`
      },
      storage_info: {
        base64_length: base64Data.length,
        sample_data: base64Data.substring(0, 100) + '...'
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during upload',
      details: error.message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('id');

    if (imageId) {
      // Return specific image
      const image = uploadedImages.find(img => img.id === imageId);

      if (!image) {
        return NextResponse.json({
          success: false,
          error: 'Image not found'
        }, { status: 404 });
      }

      // Convert base64 back to binary and return
      const binaryData = Buffer.from(image.base64Data, 'base64');

      return new Response(binaryData, {
        headers: {
          'Content-Type': image.contentType,
          'Content-Length': image.size.toString(),
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    } else {
      // Return list of uploaded images
      return NextResponse.json({
        success: true,
        message: 'Images retrieved successfully',
        images: uploadedImages.map(img => ({
          id: img.id,
          filename: img.filename,
          content_type: img.contentType,
          file_size: img.size,
          uploaded_at: img.uploadedAt,
          url: `/api/minimal-upload?id=${img.id}`
        })),
        count: uploadedImages.length,
        total_size: uploadedImages.reduce((sum, img) => sum + img.size, 0)
      });
    }

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to get image',
      details: error.message
    }, { status: 500 });
  }
}