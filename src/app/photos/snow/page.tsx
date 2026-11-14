import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/constants';
import { loadTaggedPhotos, PLUSH_PAGE_LIMIT, sortByShotAtDesc } from '@/lib/plush-photos';
import TaggedPhotoFeature, { featureFeedbackUrl } from '@/components/features/TaggedPhotoFeature';

export const metadata: Metadata = {
  title: `雪景色のポケふた（ベータ） | ${SITE_NAME}`,
  description: '雪と一緒に写るポケふた。みんなが投稿した冬の景色を集めました。',
  robots: { index: false, follow: true },
};
export const revalidate = 600;

export default async function SnowPhotosPage() {
  // 雪は季節の写真なので、投稿日ではなく撮影日の新しい順に並べる（去年の冬の写真を今年投稿する人がいる）
  const photos = sortByShotAtDesc(await loadTaggedPhotos('snow'));

  return (
    <TaggedPhotoFeature
      // 2026-11-14 までの投稿は人が確かめた判定（20261114120000_snow_tags_from_human_labels.sql）、それより後は AI の判定
      labNote="雪の写っている写真を集めています。新しい投稿は AI が見つけているので、まちがいもあります。"
      feedbackUrl={featureFeedbackUrl('雪景色のポケふた（ベータ）', '/photos/snow')}
      title="雪景色のポケふた"
      countLabel="雪と一緒に写るポケふたの写真"
      sortLabel="撮影日の新しい順"
      emptyText="雪景色の写真は、まだありません。"
      photos={photos}
      limit={PLUSH_PAGE_LIMIT}
      renderMedia={(photo, index) => (
        // 雪は蓋のまわりの景色が主役なので、切り抜かずに写真全体を見せる
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#F4F9FD_0,#DCEAF4_75%)]">
          <img
            src={`/api/photo/${photo.id}?size=small`}
            alt=""
            width={400}
            height={400}
            loading={index < 6 ? 'eager' : 'lazy'}
            className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
          />
        </div>
      )}
    />
  );
}
