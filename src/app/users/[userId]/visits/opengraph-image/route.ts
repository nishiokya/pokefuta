import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { userId: string };
};

// 旧OGP画像のURL。すでに配られたカードや X のキャッシュが旧パスを指しているので 308 で新パスへ寄せる。
// 転送先のホストは SITE_URL で組む。Amplify では request.url が内部ホスト（https://localhost:3000）になり、
// それを基準にすると本番で localhost へ飛ばしてしまう（PR #490 マージ後に本番で確認）。
export function GET(request: Request, { params }: RouteContext) {
  const { search } = new URL(request.url);
  const target = new URL(`/users/${encodeURIComponent(params.userId)}/opengraph-image`, SITE_URL);
  target.search = search;
  return NextResponse.redirect(target, 308);
}
