import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { userId: string };
};

// 旧OGP画像のURL。すでに配られたカードや X のキャッシュが旧パスを指しているので 308 で新パスへ寄せる。
export function GET(request: Request, { params }: RouteContext) {
  const url = new URL(request.url);
  const target = new URL(`/users/${encodeURIComponent(params.userId)}/opengraph-image`, url);
  target.search = url.search;
  return NextResponse.redirect(target, 308);
}
