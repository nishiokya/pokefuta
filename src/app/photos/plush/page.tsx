import type { Metadata } from 'next';
import { hasPlushClip, photoAiBoxes, photoBoxZoom } from '@/lib/photo-ai-tags';
import { SITE_NAME } from '@/lib/constants';
import { PLUSH_PAGE_LIMIT, type PlushPhoto } from '@/lib/plush-photos';
import { loadTaggedPhotosForPage } from '@/lib/tagged-photos-page';
import TaggedPhotoFeature, { featureFeedbackUrl } from '@/components/features/TaggedPhotoFeature';

// ベータ。中身（AI の判定）と見せ方を確かめてから検索に出す
export const metadata: Metadata = {
  title: `ぬいぐるみと旅するポケふた（ベータ） | ${SITE_NAME}`,
  description: 'ぬいぐるみと一緒に撮られたポケふたの写真を集めたページです。',
  robots: { index: false, follow: true },
};

// ISR にしない（ビルド時に 0 枚で焼き込まれ、画面遷移で 0 枚が出た。tagged-photos-page.ts）。
// 判定は毎朝書かれるので、DB への問い合わせだけを10分持つ
export const dynamic = 'force-dynamic';

export default async function PlushPhotosPage() {
  // 蓋とぬいぐるみをそれぞれ切り抜ける写真だけを出す（AI がぬいぐるみの枠を見つけられなかった写真は外す）。
  // 投稿の新しい順そのまま（新しく上がった写真が上に来るように。投稿者は回さない）
  let photos: PlushPhoto[] = [];
  let failed = false;
  try {
    photos = (await loadTaggedPhotosForPage('plush', PLUSH_PAGE_LIMIT, 'recent', false)).filter((photo) => hasPlushClip(photo.aiTags));
  } catch (error) {
    console.error('Failed to load plush photos:', error instanceof Error ? error.message : error);
    failed = true;
  }

  return (
    <TaggedPhotoFeature
      labNote="AI がぬいぐるみの写っている写真を見つけて、蓋とぬいぐるみが入るように切り抜いています。まちがいもあります。"
      feedbackUrl={featureFeedbackUrl('ぬいぐるみと旅するポケふた（ベータ）', '/photos/plush')}
      title="ぬいぐるみと旅するポケふた"
      countLabel="ぬいぐるみと一緒に撮られたポケふたの写真"
      sortLabel="新しく投稿された順"
      emptyText={failed ? '写真を読み込めませんでした。少し待ってから開き直してください。' : 'まだ写真がありません。'}
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
