import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage } from '@/lib/storage';

// Delete a visit and all photos attached to it.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const visitId = params.id;

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .select('id, user_id')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({
        success: false,
        error: 'Visit not found'
      }, { status: 404 });
    }

    if (visit.user_id !== session.user.id) {
      return NextResponse.json({
        success: false,
        error: 'Permission denied: You can only delete your own visits'
      }, { status: 403 });
    }

    const { data: visitPhotos, error: photosError } = await supabase
      .from('photo')
      .select('id, storage_key')
      .eq('visit_id', visitId);

    if (photosError) {
      console.error('Error fetching visit photos before delete:', photosError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch related photos',
        details: photosError.message
      }, { status: 500 });
    }

    const photosToDelete = visitPhotos || [];
    const deletedPhotoIds = photosToDelete.map((photo) => photo.id);

    for (const photo of photosToDelete) {
      try {
        if (storage.delete) {
          await storage.delete(photo.storage_key);
          console.log(`Deleted photo from storage: ${photo.storage_key}`);
        } else {
          console.warn('Storage adapter does not support delete operation');
        }
      } catch (storageError: any) {
        console.error('Error deleting photo from storage:', storageError);
        // Continue DB deletion even if the object has already gone missing.
      }
    }

    if (deletedPhotoIds.length > 0) {
      const { error: deletePhotosError } = await supabase
        .from('photo')
        .delete()
        .eq('visit_id', visitId);

      if (deletePhotosError) {
        console.error('Error deleting photos from database:', deletePhotosError);
        return NextResponse.json({
          success: false,
          error: 'Failed to delete photos from database',
          details: deletePhotosError.message
        }, { status: 500 });
      }
    }

    // visit_like / visit_comment / visit_bookmark are deleted by ON DELETE CASCADE.
    const { error: deleteVisitError } = await supabase
      .from('visit')
      .delete()
      .eq('id', visitId)
      .eq('user_id', session.user.id);

    if (deleteVisitError) {
      console.error('Error deleting visit from database:', deleteVisitError);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete visit from database',
        details: deleteVisitError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Visit deleted successfully',
      visit_id: visitId,
      photo_ids: deletedPhotoIds,
      visit_deleted: true
    });
  } catch (error: any) {
    console.error('Unexpected error deleting visit:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
