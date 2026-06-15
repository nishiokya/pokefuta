import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        authenticated: false,
        user: null
      }, { status: 200 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email
      }
    });

  } catch (error: any) {
    console.error('Error checking session:', error);
    return NextResponse.json({
      authenticated: false,
      user: null,
      error: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
