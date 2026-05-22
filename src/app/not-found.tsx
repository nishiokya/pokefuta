import type { Metadata } from 'next';
import Link from 'next/link';
import { Home, List, MapPin, Navigation } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import { SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: `ページが見つかりません | ${SITE_NAME}`,
  description: 'お探しのページは見つかりませんでした。近くのポケふたや一覧から、もう一度探せます。',
};

export default function NotFound() {
  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <Header title={SITE_NAME} />

      <main className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl items-center px-4 py-10">
        <section className="w-full overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF8EB] shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
          <div className="relative overflow-hidden bg-[#E9DEC9] px-5 py-10 text-center sm:px-8">
            <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-[#7B63A8] shadow-lg">
              <MapPin className="h-12 w-12 text-white" />
            </div>
            <p className="relative text-sm font-extrabold tracking-[0.08em] text-[#7B63A8]">
              404 NOT FOUND
            </p>
            <h1 className="relative mt-3 text-2xl font-extrabold leading-tight text-[#4F3828] sm:text-4xl">
              ページが見つかりません
            </h1>
            <p className="relative mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[#4F3828]/75 sm:text-base">
              URLが変わったか、ページが削除された可能性があります。近くのポケふたや一覧から、もう一度探してみてください。
            </p>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#7B63A8] px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#6A5299]"
            >
              <Home className="h-4 w-4" />
              ホーム
            </Link>
            <Link
              href="/nearby"
              className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#2E8B74]/25 bg-[#DFF4EA] px-4 py-3 text-sm font-extrabold text-[#236B59] transition hover:bg-[#CDEDDD]"
            >
              <Navigation className="h-4 w-4" />
              近くを探す
            </Link>
            <Link
              href="/manholes"
              className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#8C6A4A]/20 bg-white px-4 py-3 text-sm font-extrabold text-[#4F3828] transition hover:bg-[#F8F1E4]"
            >
              <List className="h-4 w-4" />
              一覧を見る
            </Link>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
