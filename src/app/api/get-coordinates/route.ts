import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const manholeId = searchParams.get('id');

    if (!manholeId) {
      return NextResponse.json({ error: 'Manhole ID is required' }, { status: 400 });
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Use SQL to extract coordinates using PostGIS functions
    const { data, error } = await supabase
      .from('manhole')
      .select(`
        id,
        title,
        municipality,
        location
      `)
      .eq('id', parseInt(manholeId))
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Manhole not found' }, { status: 404 });
    }

    // Try to use PostGIS functions via RPC
    try {
      const { data: coordData, error: coordError } = await supabase
        .rpc('extract_coordinates', { location_data: data.location });

      if (coordError) {
        console.log('RPC failed, trying SQL query');

        // Try raw SQL query
        const { data: sqlData, error: sqlError } = await supabase
          .from('manhole')
          .select(`
            id,
            title,
            ST_Y(location::geometry) as latitude,
            ST_X(location::geometry) as longitude
          `)
          .eq('id', parseInt(manholeId))
          .single();

        if (sqlError) {
          return NextResponse.json({
            ...data,
            latitude: null,
            longitude: null,
            extraction_method: 'failed',
            error: sqlError.message
          });
        }

        return NextResponse.json({
          ...data,
          latitude: sqlData?.latitude,
          longitude: sqlData?.longitude,
          extraction_method: 'sql'
        });
      }

      return NextResponse.json({
        ...data,
        ...coordData,
        extraction_method: 'rpc'
      });

    } catch (rpcError) {
      return NextResponse.json({
        ...data,
        latitude: null,
        longitude: null,
        extraction_method: 'error',
        error: (rpcError as Error).message
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}