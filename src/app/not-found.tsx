import type { Metadata } from 'next';
import { HeaderTitle } from '@/components/SiteChrome';
import LostManholePick from '@/components/LostManholePick';
import { SITE_NAME } from '@/lib/constants';
import './not-found.css';

export const metadata: Metadata = {
  title: `ページが見つかりません | ${SITE_NAME}`,
  description: 'お探しのページは見つかりませんでした。全国のポケふた（ポケモンマンホール）は図鑑・写真館から探せます。',
  robots: { index: false },
};

// 図鑑（data.pokefuta.com/404.html）と同じ見た目・同じ文言にしてある。変えるときは両方揃える
export default function NotFound() {
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe">
      <HeaderTitle value="ページが見つかりません" />

      <main className="lost">
        <section className="lost__card" aria-labelledby="lost-title">
          <div className="lost__head">
            <p className="lost__code">404 NOT FOUND</p>
            <h1 className="lost__title" id="lost-title">ページが見つかりませんでした</h1>
            <p className="lost__lead">
              URLが変わったか、ページが削除された可能性があります。
              <br />
              かわりに、こんなポケふたはいかが？
            </p>
          </div>
          <LostManholePick />
        </section>
      </main>
    </div>
  );
}
