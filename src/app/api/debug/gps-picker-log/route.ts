import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';

// /upload/gps-test の結果を受け取り、サーバーのログに1行出すだけ。DB にも R2 にも書かない。
// ログインしている人だけ受け付ける（ログを荒らされないため）。検証が終わったら消す。

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const MAX_BODY = 4096;

const STRING_FIELDS = ['variant', 'accept', 'capture', 'route', 'fileType', 'make', 'model', 'shotAt', 'ua', 'parseError'] as const;
const NUMBER_FIELDS = ['fileSize', 'gpsKeyCount', 'exifKeyCount', 'lat', 'lng'] as const;

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: NO_STORE });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413, headers: NO_STORE });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400, headers: NO_STORE });
  }

  // 決めた項目だけをログに出す。座標は「届いたか」が分かればよいので 3 桁（約 100m）に丸める
  const entry: Record<string, unknown> = { hasGps: body.hasGps === true };
  for (const key of STRING_FIELDS) {
    if (typeof body[key] === 'string') entry[key] = (body[key] as string).slice(0, 300);
  }
  for (const key of NUMBER_FIELDS) {
    if (typeof body[key] === 'number' && Number.isFinite(body[key])) entry[key] = body[key];
  }
  if (typeof entry.lat === 'number') entry.lat = Math.round(entry.lat * 1000) / 1000;
  if (typeof entry.lng === 'number') entry.lng = Math.round(entry.lng * 1000) / 1000;

  console.log('[gps-picker-test]', JSON.stringify(entry));

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
