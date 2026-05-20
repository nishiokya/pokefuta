import { permanentRedirect } from 'next/navigation';

type PageProps = {
  params: {
    photoId: string;
  };
};

export const dynamic = 'force-dynamic';

export default function LegacySharedPhotoPage({ params }: PageProps) {
  permanentRedirect(`/p/${params.photoId}`);
}
