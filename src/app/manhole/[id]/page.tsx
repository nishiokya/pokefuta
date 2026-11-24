import { buildDetailMetadata } from './PublicManholeDetail';

export { default } from './PublicManholeDetail';

// 図鑑の公開スナップショットだけで作る。訪問状態は従来どおりクライアントで取得。
export const dynamic = 'force-static';
export const revalidate = 3600;

// 新しい蓋もデプロイを待たず、最初のアクセスで生成する。
export function generateStaticParams() {
  return [];
}

export function generateMetadata({ params }: { params: { id: string } }) {
  return buildDetailMetadata(params.id);
}
