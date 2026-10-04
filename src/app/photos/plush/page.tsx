import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';
import { formatDateJaJst } from '@/lib/date';
import { feedCardTags } from '@/lib/feed-card-tags';
import { FEED_CHIP_CLASS } from '@/lib/feed-chip-class';
import { photoAiTags } from '@/lib/photo-ai-tags';
import { SITE_NAME } from '@/lib/constants';
import { MapPin, UserRound } from 'lucide-react';
import AiPhotoTags from '@/components/AiPhotoTags';
import LandscapePhotoBadge from '@/components/LandscapePhotoBadge';
import AiTagNote from '@/components/AiTagNote';
import { loadPlushPhotos, PLUSH_PAGE_LIMIT } from '@/lib/plush-photos';

// ベータ。中身（AI の判定）と見せ方を確かめてから検索に出す
export const metadata: Metadata = {
  title: `ぬいぐるみと旅するポケふた（ベータ） | ${SITE_NAME}`,
  description: 'ぬいぐるみと一緒に撮られたポケふたの写真を集めたページです。',
  robots: { index: false, follow: true },
};

// 判定は毎朝書かれる。数分古くてよいので都度の読み込みは避ける
export const revalidate = 600;

export default async function PlushPhotosPage() {
  const photos = await loadPlushPhotos();

  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-3 sm:pt-6">
        <Breadcrumb href="/" label="トップへ" />
        <header className="mb-4">
          <p className="mb-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-900 ring-1 ring-indigo-200">
            ぬいぐるみ
          </p>
          <h1 className="font-pixelJp text-xl font-bold text-[#4F3828] sm:text-2xl">
            ぬいぐるみと旅するポケふた
            <span className="ml-2 rounded-full bg-[#7B63A8] px-2 py-0.5 align-middle text-[10px] font-extrabold text-white">ベータ</span>
          </h1>
          <p className="mt-1 text-sm text-[#6A4D36]">
            ぬいぐるみと一緒に撮られたポケふたの写真 {photos.length}枚
            {photos.length >= PLUSH_PAGE_LIMIT ? `（${PLUSH_PAGE_LIMIT}枚まで）` : ''}
            <span className="ml-1 text-xs text-[#8b816f]">ぬいぐるみらしい順</span>
          </p>
        </header>

        {photos.length === 0 ? (
          <p className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF8EB] p-6 text-center text-sm text-[#6A4D36]">
            まだ写真がありません。
          </p>
        ) : (
          // カードはトップの「最新の投稿」と同じ見た目（写真の上にタグ、下の帯に場所・撮影日・投稿者）。
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
                    className="group relative block aspect-square overflow-hidden rounded-[8px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
                  >
                    <img
                      src={`/api/photo/${photo.id}?size=small`}
                      alt=""
                      width={400}
                      height={400}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading={index < 6 ? 'eager' : 'lazy'}
                    />
                    <div className="absolute left-2 right-2 top-2 flex flex-wrap gap-1">
                      <LandscapePhotoBadge isLandscape={photo.isLandscape} />
                      <AiPhotoTags photo={tagPhoto} />
                      {chips.map((chip) => (
                        <span key={chip.tag} className={`rounded-full px-2 py-1 text-xs font-extrabold leading-none shadow-sm ${FEED_CHIP_CLASS[chip.tag]}`}>
                          {chip.label}
                        </span>
                      ))}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-14 text-white sm:p-4 sm:pt-20">
                      <div className="flex min-w-0 items-center gap-1 text-sm font-extrabold sm:text-base">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-1">{photo.manholeName}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white/90">{formatDateJaJst(shotAt)}撮影</div>
                      <div className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold text-white/85">
                        <UserRound className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">投稿者 {photo.posterName}</span>
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
