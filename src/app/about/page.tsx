'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Camera,
  Compass,
  Github,
  Map,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
  Stamp,
  Twitter,
  UserPlus,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { pageTitle } from '@/lib/constants';

const journeySteps = [
  {
    icon: <Search className="h-5 w-5" />,
    title: 'ポケふたを探す',
    description: 'ポケふた図鑑で、都道府県・登場ポケモン・地図から次の目的地を探せます。',
  },
  {
    icon: <Camera className="h-5 w-5" />,
    title: '写真を投稿する',
    description: '旅先で撮った写真をアップロードして、訪問した日の記録を残せます。',
  },
  {
    icon: <Stamp className="h-5 w-5" />,
    title: 'スタンプ帳で振り返る',
    description: '訪問済みや都道府県別の進捗を見ながら、旅の続きを計画できます。',
  },
];

const featureCards = [
  {
    icon: <Map className="h-5 w-5" />,
    title: 'ポケふた図鑑',
    description: '全国の設置情報を、都道府県・登場ポケモン・地図から調べられます。',
  },
  {
    icon: <Compass className="h-5 w-5" />,
    title: 'ポケふた写真館',
    description: '訪問記録や写真を残し、スタンプ帳と都道府県別の進捗で振り返れます。',
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: '一つにつながる体験',
    description: '探すところから、現地での記録、次の旅の計画までを一つのサービスで支えます。',
  },
];

const privacyItems = [
  '訪問記録と写真はアカウントに紐づけて保存されます。',
  '位置情報の利用は任意で、撮影場所の記録や近くの候補表示に使います。',
  'ログインしなくても、ポケふた一覧や投稿写真の閲覧はできます。',
];

const disclaimerItems = [
  '本サービスはnishiokyaが個人で開発・運営する非公式サービスです。',
  'マンホール情報は公開情報を基にしていますが、訪問前に最新情報をご確認ください。',
  'ポケふたを訪問する際は、周囲の安全に配慮し、交通ルールを守ってください。',
  '本サービスの利用により生じたいかなる損害についても、運営者は責任を負いかねます。',
];

export default function AboutPage() {
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = pageTitle('このサイトについて');
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        trackView('/about', 'このサイトについて', 'about', Boolean(session?.user));
      } catch {
        trackView('/about', 'このサイトについて', 'about', false);
      }
    })();
  }, []);

  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:pt-8">
        <section className="relative overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-5 py-7 shadow-[0_12px_30px_rgba(95,68,42,0.13)] sm:px-8 sm:py-10">
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
                <Stamp className="h-3.5 w-3.5" />
                ポケふたの旅をもっと楽しく
              </div>

              <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
                ポケふたを探す、記録する、振り返る
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-[#6A4D36] sm:text-base">
                ポケふたは、全国の設置情報を調べる「ポケふた図鑑」と、写真・訪問記録を残す「ポケふた写真館」を一つにつないだ個人運営サービスです。
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                >
                  <UserPlus className="h-4 w-4" />
                  無料でスタンプ帳をはじめる
                </Link>
                <Link
                  href="/visits"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#7B63A8] bg-white px-5 py-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
                >
                  <Stamp className="h-4 w-4" />
                  旅の続きへ
                </Link>
                <a
                  href="https://data.pokefuta.com/"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#8C6A4A]/20 bg-white/70 px-5 py-3 text-sm font-bold text-[#4F3828] shadow-sm transition hover:bg-white"
                >
                  <Map className="h-4 w-4" />
                  図鑑でポケふたを探す
                </a>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#8C6A4A]/15 bg-white/65 p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-pixel text-2xl text-[#4F3828]">POKEFUTA JOURNEY</p>
                  <p className="mt-1 text-xs font-bold text-[#6A4D36]">探す、残す、振り返る</p>
                </div>
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#7B63A8]/10 text-[#7B63A8]">
                  <Compass className="h-6 w-6" />
                </div>
              </div>
              <div className="grid gap-2">
                {journeySteps.map((step, index) => (
                  <div key={step.title} className="flex items-start gap-3 rounded-[8px] border border-[#8C6A4A]/10 bg-[#FFF8EB]/80 p-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#F8D9C4] text-[#B5483C]">
                      {step.icon}
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-[#B5483C]">STEP {index + 1}</p>
                      <h2 className="mt-0.5 text-sm font-extrabold text-[#4F3828]">{step.title}</h2>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-[#6A4D36]">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          {featureCards.map((feature) => (
            <div key={feature.title} className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-4 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#7B63A8]/10 text-[#7B63A8]">
                {feature.icon}
              </div>
              <h2 className="text-sm font-extrabold text-[#4F3828]">{feature.title}</h2>
              <p className="mt-2 text-xs font-medium leading-relaxed text-[#6A4D36]">{feature.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#7B63A8]" />
              <h2 className="text-lg font-extrabold text-[#4F3828]">安心して使うために</h2>
            </div>
            <div className="space-y-2">
              {privacyItems.map((item) => (
                <p key={item} className="rounded-[8px] border border-[#8C6A4A]/10 bg-white/65 p-3 text-xs font-medium leading-relaxed text-[#6A4D36]">
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#B5483C]" />
              <h2 className="text-lg font-extrabold text-[#4F3828]">訪問前に確認してほしいこと</h2>
            </div>
            <div className="space-y-2">
              {disclaimerItems.map((item) => (
                <p key={item} className="rounded-[8px] border border-[#8C6A4A]/10 bg-white/65 p-3 text-xs font-medium leading-relaxed text-[#6A4D36]">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="mt-6 scroll-mt-24 rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-[#7B63A8]" />
                <h2 className="text-lg font-extrabold text-[#4F3828]">フィードバック</h2>
              </div>
              <p className="max-w-2xl text-sm font-medium leading-relaxed text-[#6A4D36]">
                バグ報告、機能要望、掲載情報の気づきがあればお知らせください。サービスの更新情報はXでも発信しています。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/nishiokya/pokefuta-tracker/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-[#8C6A4A]/20 bg-white px-4 py-2 text-xs font-bold text-[#4F3828] shadow-sm transition hover:bg-[#FFF8EB]"
              >
                <Github className="h-4 w-4" />
                Issues を開く
              </a>
              <a
                href="https://x.com/pokemonmanhole"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#2A2A2A] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-85"
              >
                <Twitter className="h-4 w-4" />
                @pokemonmanhole
              </a>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-[#4F3828]">運営情報</h2>
          <dl className="mt-3 grid gap-2 text-sm font-medium text-[#6A4D36] sm:grid-cols-[7rem_1fr]">
            <dt className="font-extrabold text-[#4F3828]">サービス名</dt>
            <dd>ポケふた（ポケふた写真館・ポケふた図鑑）</dd>
            <dt className="font-extrabold text-[#4F3828]">運営者</dt>
            <dd>nishiokya（個人運営）</dd>
          </dl>
          <p className="mt-3 text-xs font-medium leading-relaxed text-[#6A4D36]">
            本サービスは株式会社ポケモン、任天堂株式会社、各自治体その他の権利者とは関係ありません。ポケットモンスター・ポケモン・Pokémonは各権利者に帰属します。
          </p>
        </section>

        <section className="mt-6 rounded-[8px] border border-[#8C6A4A]/10 bg-white/55 px-4 py-3 text-center">
          <p className="text-xs font-medium text-[#6A4D36]">Version 1.0.0</p>
        </section>
      </main>

    </div>
  );
}
