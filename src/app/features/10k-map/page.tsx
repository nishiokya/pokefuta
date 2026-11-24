import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';

// 公開写真が1万枚を超えた記念（2026-11-24）。動画・画像は public/noprecache/features/10k-map/ に置いた静的ファイル
// （next-pwa は public/ を service worker で先読みするので、noprecache/ に置いてページを開くまで読ませない）。
// 数字は 2026-11-23 時点の公開写真（10,161枚）。動画の作り方は vault の作業ログにある。

const TITLE = 'みんなの写真1万枚でつくった日本地図';
const DESCRIPTION = 'ポケふた写真館に届いた公開写真10,161枚を1マス1枚で並べ、日本地図をつくりました。2025年10月の最初の1枚から、投稿された順に地図が埋まっていきます。';

export const metadata: Metadata = {
  title: `${TITLE} | ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/features/10k-map` },
  robots: { index: true, follow: true },
};

const MILESTONES = [
  { when: '2025年10月', text: '最初の1枚' },
  { when: '2026年1月', text: '最初に全部そろった県は神奈川県（5か所）' },
  { when: '2026年3月', text: '沖縄県から最初の1枚' },
  { when: '2026年7月', text: '小笠原から写真が届く' },
  { when: '2026年8月', text: '公開写真1,000枚、登録ユーザー100人' },
  { when: '2026年8月', text: '北海道の50か所がそろう' },
  { when: '2026年10月', text: 'その時点の全ポケふた482か所に写真がそろう' },
  { when: '2026年11月', text: '公開写真が10,000枚を超える' },
];

export default function TenThousandMapPage() {
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-read px-4 pb-12 pt-5 sm:pt-8">
        <p className="text-xs font-bold text-[#8C6A4A]">特集</p>
        <h1 className="mt-1 font-pixelJp text-2xl font-extrabold text-[#4F3828]">{TITLE}</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#6A4D36]">
          ポケふた写真館に届いた公開写真が10,000枚を超えました。その写真を1マス1枚で並べて、日本地図をつくりました。
          2025年10月の最初の1枚から、投稿された順に地図が埋まっていきます。
        </p>

        <video
          className="mx-auto mt-5 block w-full max-w-[480px] rounded-xl bg-[#FFF8EB] shadow-sm"
          src="/noprecache/features/10k-map/map.mp4"
          poster="/noprecache/features/10k-map/poster.webp"
          width={720}
          height={900}
          controls
          playsInline
          muted
          preload="none"
        >
          お使いのブラウザでは動画を再生できません。
        </video>
        <p className="mt-2 text-center text-xs text-[#8C6A4A]">約20秒・音なし</p>

        <section className="mt-8">
          <h2 className="mb-2 font-pixelJp text-base font-bold text-[#4F3828]">地図ができるまで</h2>
          <ol className="space-y-1.5 text-sm leading-relaxed text-[#6A4D36]">
            {MILESTONES.map((m) => (
              <li key={m.text} className="flex gap-3">
                <span className="w-24 shrink-0 font-bold text-[#4F3828]">{m.when}</span>
                <span>{m.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 font-pixelJp text-base font-bold text-[#4F3828]">地図のつくり方</h2>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-[#6A4D36]">
            <p>1マスが1枚の写真です。北海道から沖縄本島までの陸地を、写真の枚数とちょうど同じ数のマスに分け、写真をばらばらに置きました。同じポケふたの写真は隣り合わないようにしています。</p>
            <p>使ったのは、2026年11月23日の時点で公開になっている写真です。非公開の写真は入っていません。</p>
          </div>
        </section>

        <section className="mt-8 rounded-xl bg-white/80 p-4 text-sm leading-relaxed text-[#6A4D36]">
          <p className="font-bold text-[#4F3828]">投稿してくれたみなさん、ありがとうございます。</p>
          <p className="mt-1">次の1枚も、地図のどこかのマスになります。</p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/" className="font-bold text-[#7B63A8] underline hover:opacity-80">みんなの写真を見る</Link>
            <Link href="/upload" className="font-bold text-[#7B63A8] underline hover:opacity-80">写真を投稿する</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
