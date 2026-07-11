import { redirect } from 'next/navigation';

type PageProps = {
  params: {
    userId: string;
  };
};

export const dynamic = 'force-dynamic';

export default function UserPrefecturesPage({ params }: PageProps) {
  redirect(`/users/${encodeURIComponent(params.userId)}/visits`);
}
