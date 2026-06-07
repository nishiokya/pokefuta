import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const userId = session.user.id;
    const { id: visitId, commentId } = params;

    const { data: comment, error: fetchError } = await supabase
      .from('visit_comment')
      .select('id, user_id')
      .eq('id', commentId)
      .eq('visit_id', visitId)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({
        success: false,
        error: 'Comment not found'
      }, { status: 404 });
    }

    if (comment.user_id !== userId) {
      return NextResponse.json({
        success: false,
        error: 'You can only delete your own comments'
      }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from('visit_comment')
      .delete()
      .eq('id', commentId);

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete comment',
        details: deleteError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (error: any) {
    console.error('Unexpected error deleting comment:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
