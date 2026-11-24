import { buildDetailMetadata } from '../PublicManholeDetail';

export { default } from '../PublicManholeDetail';

// 写真の公開状態は共有カードを取得した時点で判定する。
export const dynamic = 'force-dynamic';

export function generateMetadata({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { photo?: string | string[] };
}) {
  const photo = searchParams.photo;
  return buildDetailMetadata(params.id, typeof photo === 'string' ? photo : undefined);
}
