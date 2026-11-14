import type { ReactNode } from 'react';
import Link from 'next/link';
import { FlaskConical, MapPin, MessageCircle, Tag, UserRound } from 'lucide-react';
import { formatDateJaJst } from '@/lib/date';
import { feedCardTags } from '@/lib/feed-card-tags';
import { FEED_CHIP_CLASS } from '@/lib/feed-chip-class';
import { photoAiTags } from '@/lib/photo-ai-tags';
import type { PlushPhoto } from '@/lib/plush-photos';
import LandscapePhotoBadge from '@/components/LandscapePhotoBadge';
import AiTagNote from '@/components/AiTagNote';
import PosterRegularBadge from '@/components/PosterRegularBadge';
import PosterAvatar from '@/components/users/PosterAvatar';

/**
 * AI のタグで写真を集めた特集ページ（/photos/plush・/photos/snow）の共通の枠。
 * ラボの帯・見出し・カードの下半分（場所・投稿者・撮影日・ポケモン・ひとこと）・注釈を揃え、
 * 写真の見せ方（ぬいぐるみは蓋とぬいぐるみの切り抜き、雪は写真全体）だけをページが renderMedia で決める。
 */

// カードに出すポケモンのタグの数。蓋によっては5匹以上描かれていて、カードが縦に伸びる
const POKEMON_TAG_LIMIT = 3;

/** 感想は公式 X へ（/about の「フィードバック」と同じ宛先）。本文にページの名前と URL を入れておく */
export function featureFeedbackUrl(pageName: string, path: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(`@pokemonmanhole ${pageName}の感想: `)}&url=${encodeURIComponent(`https://pokefuta.com${path}`)}`;
}

/** 撮影日（無ければ投稿日）の新しい順。同じ日時は投稿の新しい順 */
export function sortByShotAtDesc(photos: PlushPhoto[]): PlushPhoto[] {
  const time = (value: string | null) => {
    const t = value ? Date.parse(value) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  return [...photos].sort(
    (a, b) => time(b.shotAt ?? b.createdAt) - time(a.shotAt ?? a.createdAt) || time(b.createdAt) - time(a.createdAt),
  );
}

export type TaggedPhotoFeatureProps = {
  /** ラボの帯の説明（どう選んでいるか・間違いがあること） */
  labNote: ReactNode;
  feedbackUrl: string;
  title: string;
  /** 見出しの下の「〜の写真 N枚」の「〜の写真」の部分 */
  countLabel: string;
  sortLabel: string;
  emptyText: string;
  photos: PlushPhoto[];
  limit: number;
  /** カードの写真の正方形の中身。index は先頭数枚を eager にするため */
  renderMedia: (photo: PlushPhoto, index: number) => ReactNode;
};

export default function TaggedPhotoFeature({
  labNote,
  feedbackUrl,
  title,
  countLabel,
  sortLabel,
  emptyText,
  photos,
  limit,
  renderMedia,
}: TaggedPhotoFeatureProps) {
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-page px-4 lg:px-8 pb-8 pt-3 sm:pt-6">
        {/* 実験ラボの帯。AI で選んでいること・間違いがあることを先に伝え、感想をもらう */}
        <section className="mb-4 overflow-hidden rounded-[12px] border border-dashed border-[#7B63A8]/50 bg-[repeating-linear-gradient(135deg,#F3EEFA_0,#F3EEFA_12px,#EEE6F8_12px,#EEE6F8_24px)] p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7B63A8] px-2.5 py-1 text-xs font-extrabold text-white">
              <FlaskConical className="h-3.5 w-3.5" />
              ポケふたラボ・実験中
            </span>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-[#4A3A66] sm:text-sm">{labNote}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={feedbackUrl}
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
            {title}
            <span className="ml-2 rounded-full bg-[#7B63A8] px-2 py-0.5 align-middle text-[10px] font-extrabold text-white">ベータ</span>
          </h1>
          <p className="mt-1 text-sm text-[#6A4D36]">
            {countLabel} {photos.length}枚
            {photos.length >= limit ? `（${limit}枚まで）` : ''}
            <span className="ml-1 text-xs text-[#8b816f]">{sortLabel}</span>
          </p>
        </header>

        {photos.length === 0 ? (
          <p className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF8EB] p-6 text-center text-sm text-[#6A4D36]">
            {emptyText}
          </p>
        ) : (
          // 写真の上に重ねるのはタグだけ。場所・撮影日・投稿者は写真を隠さないよう下に書く。
          // 押すと投稿者のページへ直接飛ぶ。公開IDの無い投稿者は写真の個別ページへ
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <TaggedPhotoCard photo={photo} media={renderMedia(photo, index)} />
              </li>
            ))}
          </ul>
        )}
        <AiTagNote className="mt-4" show={photos.length > 0} />
      </main>
    </div>
  );
}

function TaggedPhotoCard({ photo, media }: { photo: PlushPhoto; media: ReactNode }) {
  const shotAt = photo.shotAt ?? photo.createdAt;
  const chips = feedCardTags(
    { id: photo.visitId, manhole_id: photo.manholeId, shot_at: shotAt, manhole: { pokemons: photo.pokemons } },
    undefined,
  );
  const aiLabels = photoAiTags({ ai_tags: photo.aiTags, is_landscape: photo.isLandscape }, { compact: true }).map((t) => t.label);
  const href = photo.posterPublicId ? `/users/${encodeURIComponent(photo.posterPublicId)}/visits` : `/p/${photo.id}`;
  // 蓋のタグは描かれているポケモン（多い蓋は3匹まで）
  const pokemonTags = photo.pokemons.slice(0, POKEMON_TAG_LIMIT);
  // カード全体に aria-label を張るので、写真の上の文字は読み上げられない。同じ内容をここに書く
  const ariaLabel = [
    photo.isLandscape ? '周辺の風景' : null,
    ...aiLabels,
    ...chips.map((chip) => chip.label),
    photo.manholeName,
    ...pokemonTags,
    `撮影 ${formatDateJaJst(shotAt)}`, // 表示と同じ JST（本番のサーバーは UTC）
    `投稿者 ${photo.posterName}`,
    photo.comment ? `ひとこと ${photo.comment}` : null,
    photo.posterPublicId ? '投稿者のページへ' : '写真を見る',
  ].filter(Boolean).join('、');

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="group block overflow-hidden rounded-[10px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
    >
      <div className="relative aspect-square overflow-hidden bg-[#EFE4CC]">
        {media}
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
          <PosterAvatar publicUserId={photo.posterPublicId} size={14} fallback={<UserRound className="h-3.5 w-3.5 shrink-0" />} />
          <span className="truncate">{photo.posterName}</span>
          <PosterRegularBadge publicUserId={photo.posterPublicId} size="icon" />
        </div>
        {/* スマホの2列だと名前と日付が1行に入らず名前が切れるので、撮影日は行を分ける */}
        <div className="mt-0.5 text-[11px] text-[#8b816f]">撮影 {formatDateJaJst(shotAt)}</div>
        {pokemonTags.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {pokemonTags.map((name) => (
              <li key={name} className="inline-flex items-center gap-0.5 rounded-full bg-[#F3EEFA] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#5B4688] ring-1 ring-[#7B63A8]/25">
                <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        )}
        {photo.comment && (
          <p className="mt-1.5 line-clamp-2 rounded-[6px] bg-[#F6EEDC] px-2 py-1 text-[11px] leading-snug text-[#4F3828]">
            {photo.comment}
          </p>
        )}
      </div>
    </Link>
  );
}
