import type { Metadata } from 'next';
import { hasPlushClip, photoAiBoxes, photoBoxZoom } from '@/lib/photo-ai-tags';
import { SITE_NAME } from '@/lib/constants';
import { loadPlushPhotos, PLUSH_PAGE_LIMIT } from '@/lib/plush-photos';
import TaggedPhotoFeature, { featureFeedbackUrl } from '@/components/features/TaggedPhotoFeature';

// ベータ。中身（AI の判定）と見せ方を確かめてから検索に出す
export const metadata: Metadata = {
  title: `ぬいぐるみと旅するポケふた（ベータ） | ${SITE_NAME}`,
  description: 'ぬいぐるみと一緒に撮られたポケふたの写真を集めたページです。',
  robots: { index: false, follow: true },
};

// 判定は毎朝書かれる。数分古くてよいので都度の読み込みは避ける
export const revalidate = 600;

export default async function PlushPhotosPage() {
  // 蓋とぬいぐるみをそれぞれ切り抜ける写真だけを出す（AI がぬいぐるみの枠を見つけられなかった写真は外す）。
  // 投稿の新しい順そのまま（新しく上がった写真が上に来るように。投稿者は回さない）
  const photos = (await loadPlushPhotos(PLUSH_PAGE_LIMIT, 'recent', false)).filter((photo) => hasPlushClip(photo.aiTags));

  return (
    <TaggedPhotoFeature
      labNote="AI がぬいぐるみの写っている写真を見つけて、蓋とぬいぐるみが入るように切り抜いています。まちがいもあります。"
      feedbackUrl={featureFeedbackUrl('ぬいぐるみと旅するポケふた（ベータ）', '/photos/plush')}
      title="ぬいぐるみと旅するポケふた"
      countLabel="ぬいぐるみと一緒に撮られたポケふたの写真"
      sortLabel="新しく投稿された順"
      emptyText="まだ写真がありません。"
      photos={photos}
      limit={PLUSH_PAGE_LIMIT}
      renderMedia={(photo, index) => {
        // 蓋とぬいぐるみをそれぞれ切り抜いて並べる（一覧は両方の枠がある写真だけ。hasPlushClip で絞ってある）
        const boxes = photoAiBoxes(photo.aiTags);
        const lidClip = boxes.lid ? photoBoxZoom(photo.aiTags, boxes.lid, 1.04) : undefined;
        const plushClip = boxes.plush ? photoBoxZoom(photo.aiTags, boxes.plush, 1.12) : undefined;
        const src = `/api/photo/${photo.id}?size=small`;
        return (
          // 蓋（丸いスタンプ、左上、大きく）とぬいぐるみ（角丸のステッカー、蓋の半分の大きさで右下に重ねる）
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#FFF8EB_0,#F1E3C6_75%)]">
            <div className="absolute left-[4%] top-[4%] aspect-square w-[80%] overflow-hidden rounded-full bg-[#EFE4CC] shadow-md ring-[3px] ring-white transition duration-300 group-hover:-rotate-3">
              <img src={src} alt="" width={400} height={400} style={lidClip} loading={index < 6 ? 'eager' : 'lazy'} />
            </div>
            <div className="absolute bottom-[4%] right-[4%] aspect-square w-[40%] rotate-[4deg] overflow-hidden rounded-[16%] bg-[#EFE4CC] shadow-lg ring-[3px] ring-white transition duration-300 group-hover:rotate-[8deg]">
              <img src={src} alt="" width={400} height={400} style={plushClip} loading={index < 6 ? 'eager' : 'lazy'} />
            </div>
          </div>
        );
      }}
    />
  );
}
