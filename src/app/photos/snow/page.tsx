import type { Metadata } from 'next';
import Link from 'next/link';
import { Snowflake } from 'lucide-react';
import { SITE_NAME } from '@/lib/constants';
import { formatDateJaJst } from '@/lib/date';
import { loadTaggedPhotos, PLUSH_PAGE_LIMIT } from '@/lib/plush-photos';

export const metadata: Metadata = {
  title: `雪景色のポケふた | ${SITE_NAME}`,
  description: '雪と一緒に写るポケふた。みんなが投稿した冬の景色を集めました。',
  robots: { index: false, follow: true },
};
export const revalidate = 600;

export default async function SnowPhotosPage() {
  const photos = await loadTaggedPhotos('snow');
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-page px-4 pb-8 pt-3 sm:pt-6 lg:px-8">
        <Link href="/" className="text-sm text-[#7B63A8] hover:underline">‹ 写真館へ</Link>
        <header className="my-4 rounded-xl bg-gradient-to-br from-sky-50 to-white p-5 ring-1 ring-sky-200 sm:p-8">
          <Snowflake className="mb-3 h-7 w-7 text-sky-600" aria-hidden="true" />
          <h1 className="font-pixelJp text-xl font-bold text-sky-950 sm:text-2xl">雪景色のポケふた</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">雪に囲まれた一枚、冬の旅で出会った景色。みんなの写真でめぐる、雪の日のポケふた。</p>
          <p className="mt-3 text-xs text-slate-500">写真 {photos.length}枚{photos.length >= PLUSH_PAGE_LIMIT ? `（${PLUSH_PAGE_LIMIT}枚まで）` : ''} · 新しく投稿された順</p>
          <p className="mt-2 text-xs text-slate-500">※ 雪の写っている写真を AI で自動判定しています。間違っていたらごめんなさい。</p>
        </header>
        {photos.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-center text-sm text-slate-600">雪景色の写真は、まだありません。</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <Link href={`/p/${photo.id}`} className="group block overflow-hidden rounded-xl bg-white shadow-sm transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
                  <div className="flex aspect-square items-center justify-center bg-sky-50">
                    <img src={`/api/photo/${photo.id}?size=medium`} alt={`${photo.manholeName}の雪景色`} width={600} height={600} loading={index < 6 ? 'eager' : 'lazy'} className="h-full w-full object-contain" />
                  </div>
                  <div className="p-3">
                    <h2 className="text-sm font-bold text-[#4F3828] group-hover:underline">{photo.manholeName}</h2>
                    <p className="mt-1 text-xs text-slate-500">撮影 {formatDateJaJst(photo.shotAt ?? photo.createdAt)}</p>
                    <p className="mt-1 truncate text-xs text-slate-600">{photo.posterName}</p>
                    {photo.comment && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{photo.comment}</p>}
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
