import { permanentRedirect } from 'next/navigation';

type PageProps = {
  params: {
    userId: string;
  };
};

export const dynamic = 'force-dynamic';

export default function UserPrefecturesPage({ params }: PageProps) {
  permanentRedirect(`/users/${encodeURIComponent(params.userId)}`);
}
