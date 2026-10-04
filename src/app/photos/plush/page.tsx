import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';
import { formatDateJa } from '@/lib/date';
import { SITE_NAME } from '@/lib/constants';
import { AI_TAG_HELP } from '@/lib/photo-ai-tags';
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
            <span className="mr-1 text-[9px] font-extrabold text-indigo-500">AI</span>ぬいぐるみ
          </p>
          <h1 className="font-pixelJp text-xl font-bold text-[#4F3828] sm:text-2xl">
            ぬいぐるみと旅するポケふた
            <span className="ml-2 rounded-full bg-[#7B63A8] px-2 py-0.5 align-middle text-[10px] font-extrabold text-white">ベータ</span>
          </h1>
          <p className="mt-1 text-sm text-[#6A4D36]">
            ぬいぐるみと一緒に撮られたポケふたの写真 {photos.length}枚
            {photos.length >= PLUSH_PAGE_LIMIT ? `（新しい順に${PLUSH_PAGE_LIMIT}枚まで）` : ''}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[#8b816f]">{AI_TAG_HELP}</p>
        </header>

        {photos.length === 0 ? (
          <p className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF8EB] p-6 text-center text-sm text-[#6A4D36]">
            まだ写真がありません。
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <Link
                  href={`/p/${photo.id}`}
                  className="group block overflow-hidden rounded-[10px] border border-[#e9dfc7] bg-[#fffdf7] shadow-sm"
                >
                  <div className="aspect-square overflow-hidden bg-[#ece2cd]">
                    <img
                      src={`/api/photo/${photo.id}?size=small`}
                      alt={`${photo.manholeName}のポケふたとぬいぐるみの写真`}
                      width={400}
                      height={400}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      loading={index < 8 ? 'eager' : 'lazy'}
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="truncate font-pixelJp text-[12px] font-bold text-[#4F3828]">{photo.manholeName}</p>
                    <p className="text-[10.5px] text-[#8b816f]">{formatDateJa(photo.shotAt ?? photo.createdAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
