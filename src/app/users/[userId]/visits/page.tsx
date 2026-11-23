import { permanentRedirect } from 'next/navigation';

type PageProps = {
  params: { userId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = 'force-dynamic';

// 公開スタンプ帳の正規URLは /users/<id>。旧URLは共有済みのリンクを生かすため恒久リダイレクトで残す。
export default function LegacyUserVisitsPage({ params, searchParams }: PageProps) {
  const qs = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value !== undefined) qs.append(key, value);
  });
  const query = qs.toString();
  permanentRedirect(`/users/${encodeURIComponent(params.userId)}${query ? `?${query}` : ''}`);
}
