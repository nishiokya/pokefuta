import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateJaJst } from '@/lib/date';
import { feedCardTags } from '@/lib/feed-card-tags';
import { FEED_CHIP_CLASS } from '@/lib/feed-chip-class';
import { hasPlushClip, photoAiBoxes, photoAiTags, photoBoxZoom } from '@/lib/photo-ai-tags';
import { SITE_NAME } from '@/lib/constants';
import { FlaskConical, MapPin, MessageCircle, UserRound } from 'lucide-react';
import LandscapePhotoBadge from '@/components/LandscapePhotoBadge';
import AiTagNote from '@/components/AiTagNote';
import { loadPlushPhotos, PLUSH_PAGE_LIMIT } from '@/lib/plush-photos';
import PosterRegularBadge from '@/components/PosterRegularBadge';

// ベータ。中身（AI の判定）と見せ方を確かめてから検索に出す
export const metadata: Metadata = {
  title: `ぬいぐるみと旅するポケふた（ベータ） | ${SITE_NAME}`,
  description: 'ぬいぐるみと一緒に撮られたポケふたの写真を集めたページです。',
  robots: { index: false, follow: true },
};

// 判定は毎朝書かれる。数分古くてよいので都度の読み込みは避ける
export const revalidate = 600;

// 感想は公式 X へ（/about の「フィードバック」と同じ宛先）。本文にページの URL を入れておく
const FEEDBACK_URL = `https://x.com/intent/post?text=${encodeURIComponent('@pokemonmanhole ぬいぐるみと旅するポケふた（ベータ）の感想: ')}&url=${encodeURIComponent('https://pokefuta.com/photos/plush')}`;

export default async function PlushPhotosPage() {
  // 蓋とぬいぐるみをそれぞれ切り抜ける写真だけを出す（AI がぬいぐるみの枠を見つけられなかった写真は外す）
  const photos = (await loadPlushPhotos()).filter((photo) => hasPlushClip(photo.aiTags));

  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-3 sm:pt-6">
        {/* 実験ラボの帯。AI で選んで切り抜いていること・間違いがあることを先に伝え、感想をもらう */}
        <section className="mb-4 overflow-hidden rounded-[12px] border border-dashed border-[#7B63A8]/50 bg-[repeating-linear-gradient(135deg,#F3EEFA_0,#F3EEFA_12px,#EEE6F8_12px,#EEE6F8_24px)] p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7B63A8] px-2.5 py-1 text-xs font-extrabold text-white">
              <FlaskConical className="h-3.5 w-3.5" />
              ポケふたラボ・実験中
            </span>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-[#4A3A66] sm:text-sm">
              AI がぬいぐるみの写っている写真を見つけて、蓋とぬいぐるみが入るように切り抜いています。まちがいもあります。
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#5B4688] ring-1 ring-[#7B63A8]/40 transition hover:bg-[#F3EEFA]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              感想をおくる
            </a>
          </div>
        </section>
        <header className="mb-4">
          <h1 className="font-pixelJp text-xl font-bold text-[#4F3828] sm:text-2xl">
            ぬいぐるみと旅するポケふた
            <span className="ml-2 rounded-full bg-[#7B63A8] px-2 py-0.5 align-middle text-[10px] font-extrabold text-white">ベータ</span>
          </h1>
          <p className="mt-1 text-sm text-[#6A4D36]">
            ぬいぐるみと一緒に撮られたポケふたの写真 {photos.length}枚
            {photos.length >= PLUSH_PAGE_LIMIT ? `（${PLUSH_PAGE_LIMIT}枚まで）` : ''}
            <span className="ml-1 text-xs text-[#8b816f]">いろんな人の写真を順番に</span>
          </p>
        </header>

        {photos.length === 0 ? (
          <p className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF8EB] p-6 text-center text-sm text-[#6A4D36]">
            まだ写真がありません。
          </p>
        ) : (
          // ベータ: 写真は蓋とぬいぐるみをそれぞれ切り抜いて並べる（ai_tags.lid と plush_box）。
          // ぬいぐるみが写真に隠れないよう、場所・撮影日・投稿者は写真に重ねず下に書く。
          // 押すと投稿者のページへ直接飛ぶ。公開IDの無い投稿者は写真の個別ページへ
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
            {photos.map((photo, index) => {
              const chips = feedCardTags(
                { id: photo.visitId, manhole_id: photo.manholeId, shot_at: photo.shotAt ?? photo.createdAt, manhole: { pokemons: photo.pokemons } },
                undefined,
              );
              const tagPhoto = { ai_tags: photo.aiTags, is_landscape: photo.isLandscape };
              const aiLabels = photoAiTags(tagPhoto).map((t) => t.label);
              const href = photo.posterPublicId ? `/users/${encodeURIComponent(photo.posterPublicId)}/visits` : `/p/${photo.id}`;
              const shotAt = photo.shotAt ?? photo.createdAt;
              const boxes = photoAiBoxes(photo.aiTags);
              // 蓋とぬいぐるみをそれぞれ切り抜いて並べる（一覧は両方の枠がある写真だけ。hasPlushClip で絞ってある）
              const lidClip = boxes.lid ? photoBoxZoom(photo.aiTags, boxes.lid, 1.04) : undefined;
              const plushClip = boxes.plush ? photoBoxZoom(photo.aiTags, boxes.plush, 1.12) : undefined;
              const src = `/api/photo/${photo.id}?size=small`;
              // カード全体に aria-label を張るので、写真の上の文字は読み上げられない。同じ内容をここに書く
              const ariaLabel = [
                photo.isLandscape ? '周辺の風景' : null,
                ...aiLabels,
                ...chips.map((chip) => chip.label),
                photo.manholeName,
                `撮影 ${formatDateJaJst(shotAt)}`,   // 表示と同じ JST（本番のサーバーは UTC）
                `投稿者 ${photo.posterName}`,
                photo.posterPublicId ? '投稿者のページへ' : '写真を見る',
              ].filter(Boolean).join('、');
              return (
                <li key={photo.id}>
                  <Link
                    href={href}
                    aria-label={ariaLabel}
                    className="group block overflow-hidden rounded-[10px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
                  >
                    <div className="relative aspect-square overflow-hidden bg-[#EFE4CC]">
                      {/* 蓋（丸いスタンプ、左上、大きく）とぬいぐるみ（角丸のステッカー、蓋の半分の大きさで右下に重ねる） */}
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#FFF8EB_0,#F1E3C6_75%)]">
                        <div className="absolute left-[4%] top-[4%] aspect-square w-[80%] overflow-hidden rounded-full bg-[#EFE4CC] shadow-md ring-[3px] ring-white transition duration-300 group-hover:-rotate-3">
                          <img src={src} alt="" width={400} height={400} style={lidClip} loading={index < 6 ? 'eager' : 'lazy'} />
                        </div>
                        <div className="absolute bottom-[4%] right-[4%] aspect-square w-[40%] rotate-[4deg] overflow-hidden rounded-[16%] bg-[#EFE4CC] shadow-lg ring-[3px] ring-white transition duration-300 group-hover:rotate-[8deg]">
                          <img src={src} alt="" width={400} height={400} style={plushClip} loading={index < 6 ? 'eager' : 'lazy'} />
                        </div>
                      </div>
                      {(photo.isLandscape || chips.length > 0) && (
                        <div className="absolute left-2 right-2 top-2 flex flex-wrap gap-1">
                          <LandscapePhotoBadge isLandscape={photo.isLandscape} />
                          {chips.map((chip) => (
                            <span key={chip.tag} className={`rounded-full px-2 py-1 text-xs font-extrabold leading-none shadow-sm ${FEED_CHIP_CLASS[chip.tag]}`}>
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 py-2 sm:px-3">
                      <div className="flex min-w-0 items-center gap-1 text-sm font-extrabold text-[#4F3828]">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#7B63A8]" />
                        <span className="line-clamp-1">{photo.manholeName}</span>
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-semibold text-[#6A4D36]">
                        <UserRound className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{photo.posterName}</span>
                        <PosterRegularBadge publicUserId={photo.posterPublicId} />
                        <span className="ml-auto shrink-0 text-[#8b816f]">{formatDateJaJst(shotAt)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <AiTagNote className="mt-4" show={photos.length > 0} />
      </main>
    </div>
  );
}
