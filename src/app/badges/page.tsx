import type { Metadata } from 'next';
import Link from 'next/link';
import PCShell from '@/components/PCShell';
import RegularBadge from '@/components/RegularBadge';
import { MEDAL_STYLES, medalTier, type MedalTier } from '@/components/users/PrefectureBadgeShelf';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import {
  POKEMON_BADGE_MIN_MANHOLES,
  buildPokemonBadges,
  buildPrefectureBadges,
  buildThemeBadges,
  type BadgeManhole,
} from '@/lib/badge-catalog';
import {
  REGULAR_BADGE_NAME,
  REGULAR_TIERS_ASCENDING,
  REGULAR_TIER_MIN_MANHOLES,
} from '@/lib/regular-badges';
import { prefectureDexUrl } from '@/lib/prefectureSlug';
import { pokemonDexUrl } from '@/lib/pokemonSlug';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `バッジ一覧｜すべてのバッジと条件 | ${SITE_NAME}`,
  description:
    'ポケふた写真館にあるバッジの説明です。訪問した枚数で上がる5段階の称号（ROOKIE〜LEGEND）、都道府県制覇の金・銀・銅のメダル、ポケモンとテーマのコンプリートの条件と、どこに表示されるかをまとめています。',
  alternates: { canonical: `${SITE_URL}/badges` },
  robots: { index: true, follow: true },
};

const X_URL = 'https://x.com/pokemonmanhole';
/** テーマはこの枚数以上のものを並べる（1枚だけのテーマは最北端・最南端などの1枚もの） */
const THEME_MIN_MANHOLES = 5;

const MEDAL_LABEL: Record<MedalTier, string> = { gold: '金', silver: '銀', bronze: '銅' };
const MEDAL_RULE: Record<MedalTier, string> = {
  gold: 'ポケふたが20枚以上の県',
  silver: '5〜19枚の県',
  bronze: '4枚以下の県',
};

const shortPrefecture = (name: string) => (name === '北海道' ? name : name.replace(/[都府県]$/, ''));

function SectionHeading({ id, icon, title, where }: { id: string; icon: string; title: string; where: string }) {
  return (
    <div className="border-b-2 border-dotted border-[#8C6A4A]/25 pb-2">
      <h2 id={id} className="flex items-center gap-2 font-pixelJp text-lg font-extrabold text-[#4F3828]">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h2>
      <p className="mt-0.5 text-[11px] font-bold text-[#8C6A4A]">表示される場所: {where}</p>
    </div>
  );
}

/** 条件を1行ずつ。「どうすればもらえるか」だけを短く */
function Rules({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-xs leading-relaxed text-[#6A4D36]">
      {items.map((item) => (
        <li key={item} className="flex gap-1.5">
          <span className="text-[#B5483C]" aria-hidden="true">●</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PrefectureMedal({ name, total }: { name: string; total: number }) {
  const style = MEDAL_STYLES[medalTier(total)];
  const label = shortPrefecture(name);
  const href = prefectureDexUrl(name);
  const body = (
    <>
      <span className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br p-[3px] shadow-sm transition group-hover:scale-105 ${style.medal}`}>
        <span className={`flex h-full w-full items-center justify-center rounded-full bg-white/90 px-0.5 text-center font-pixelJp font-extrabold leading-tight text-[#4F3828] ${label.length >= 4 ? 'text-[10px]' : 'text-xs'}`}>
          {label}
        </span>
      </span>
      <span className="mt-1 font-pixel text-[10px] text-[#8C6A4A]">{total}枚</span>
    </>
  );
  return href ? (
    <a href={href} className="group flex flex-col items-center" title={`${name} 全${total}枚`}>{body}</a>
  ) : (
    <span className="flex flex-col items-center">{body}</span>
  );
}

export default async function BadgesPage() {
  const snapshot = await fetchManholeSnapshot();
  const manholes: BadgeManhole[] = (snapshot?.manholes ?? []).map((m) => ({
    id: m.id,
    prefecture: m.prefecture,
    pokemons: m.pokemons,
    hashtags: Array.isArray(m.hashtags) ? m.hashtags : null,
  }));
  const regions = buildPrefectureBadges(manholes);
  const prefectureCount = regions.reduce((sum, region) => sum + region.prefectures.length, 0);
  const medalCounts = regions
    .flatMap((region) => region.prefectures)
    .reduce<Record<MedalTier, number>>(
      (acc, p) => ({ ...acc, [medalTier(p.total)]: acc[medalTier(p.total)] + 1 }),
      { gold: 0, silver: 0, bronze: 0 },
    );
  const pokemon = buildPokemonBadges(manholes);
  const themes = buildThemeBadges(manholes);
  const shownThemes = themes.filter((t) => t.total >= THEME_MIN_MANHOLES);

  return (
    <PCShell className="pb-32 pt-5 lg:pt-6">
      <main className="mx-auto max-w-3xl space-y-9">
        <header className="relative overflow-hidden rounded-[12px] border border-[#7B63A8]/15 bg-gradient-to-br from-[#FFF8EB] via-[#FFF3DF] to-[#F3ECFB] px-5 py-6 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-8">
          <span className="pointer-events-none absolute -right-4 -top-6 select-none text-[110px] opacity-[0.08]" aria-hidden="true">🏅</span>
          <p className="font-pixelJp text-xs font-bold tracking-widest text-[#7B63A8]">BADGE GUIDE</p>
          <h1 className="mt-1 font-pixelJp text-2xl font-extrabold text-[#4F3828] sm:text-3xl">バッジ一覧</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6A4D36]">
            ポケふたを訪問して写真を登録すると集まるバッジと、そのもらい方です。
            集めたバッジはスタンプ帳と公開スタンプ帳に並びます。
          </p>
          {/* 目次。PokéStamps と同じく、種類ごとに飛べるようにする */}
          <nav aria-label="バッジの種類" className="mt-4 flex flex-wrap gap-2">
            {[
              ['#badges-tiers', '🏆 称号'],
              ['#badges-prefectures', '🗾 都道府県制覇'],
              ['#badges-pokemon', '⚡ ポケモン'],
              ['#badges-themes', '🏷 テーマ'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full border border-[#7B63A8]/25 bg-white/80 px-3 py-1 text-xs font-bold text-[#7B63A8] hover:bg-white">
                {label}
              </a>
            ))}
          </nav>
        </header>

        <aside className="flex gap-3 rounded-[10px] border border-[#B5483C]/25 bg-[#FFF4EE] px-4 py-3">
          <span className="text-xl" aria-hidden="true">🛠</span>
          <p className="text-xs leading-relaxed text-[#6A4D36]">
            <b className="text-[#B5483C]">バッジは調整中です。</b>
            名前や条件はこれから変わることがあります。「こんなバッジがほしい」というアイデアを
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="mx-0.5 font-bold text-[#B5483C] underline">
              X（@pokemonmanhole）
            </a>
            で募集しています。
          </p>
        </aside>

        {/* 称号 */}
        <section aria-labelledby="badges-tiers" className="scroll-mt-20 space-y-4">
          <SectionHeading id="badges-tiers" icon="🏆" title="称号（5段階）" where="投稿者の名前の横・公開スタンプ帳" />
          <Rules
            items={[
              '公開で訪問したポケふたの枚数で上がります。同じポケふたに何度行っても1枚です。',
              '非公開の訪問は数えません。反映は翌朝です。',
            ]}
          />
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {REGULAR_TIERS_ASCENDING.map((tier, index) => (
              <li
                key={tier}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-[#8C6A4A]/15 bg-white/80 px-3 py-2.5 sm:flex-col sm:items-center sm:py-4"
              >
                <span className="flex items-center gap-2 sm:flex-col">
                  <span className="font-pixel text-[10px] text-[#B9A88C]">Lv.{index + 1}</span>
                  <RegularBadge tier={tier} size="md" />
                </span>
                <span className="text-right sm:text-center">
                  <span className="block font-pixel text-base font-bold text-[#4F3828]">{REGULAR_TIER_MIN_MANHOLES[tier]}枚</span>
                  <span className="block text-[10px] text-[#8C6A4A]">{REGULAR_BADGE_NAME[tier]} の条件</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* 都道府県制覇 */}
        <section aria-labelledby="badges-prefectures" className="scroll-mt-20 space-y-4">
          <SectionHeading id="badges-prefectures" icon="🗾" title="都道府県制覇バッジ" where="公開スタンプ帳の「制覇した都道府県」" />
          <Rules
            items={[
              `その県のポケふたを全部訪問すると制覇です。ポケふたのある${prefectureCount}都道府県にあります。`,
              '制覇したあとで新しいポケふたが増えても、バッジは消えません。「新しいポケふたが増えました」の段に並び、また行く理由になります。',
              'あと3枚以内の県は「リーチ」として棚に出ます。',
            ]}
          />
          <div className="grid grid-cols-3 gap-2">
            {(['gold', 'silver', 'bronze'] as const).map((tier) => (
              <div key={tier} className={`rounded-[10px] border bg-gradient-to-br px-2 py-3 text-center ${MEDAL_STYLES[tier].chip}`}>
                <span className={`mx-auto block h-8 w-8 rounded-full bg-gradient-to-br shadow-inner ${MEDAL_STYLES[tier].medal}`} aria-hidden="true" />
                <p className="mt-1.5 font-pixelJp text-sm font-extrabold text-[#4F3828]">{MEDAL_LABEL[tier]}メダル</p>
                <p className="text-[10px] leading-snug text-[#6A4D36]">{MEDAL_RULE[tier]}</p>
                <p className="mt-0.5 font-pixel text-[10px] text-[#8C6A4A]">{medalCounts[tier]}県</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {regions.map((region) => (
              <div key={region.region} className="rounded-[10px] bg-white/60 p-3 sm:p-4">
                <h3 className="mb-2.5 font-pixelJp text-sm font-bold text-[#8C6A4A]">{region.region}</h3>
                <div className="grid grid-cols-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-7">
                  {region.prefectures.map((p) => (
                    <PrefectureMedal key={p.name} name={p.name} total={p.total} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ポケモン */}
        <section aria-labelledby="badges-pokemon" className="scroll-mt-20 space-y-4">
          <SectionHeading id="badges-pokemon" icon="⚡" title="ポケモンコンプリート" where="スタンプ帳の「ポケモン」・公開スタンプ帳のポケモン図鑑" />
          <Rules
            items={[
              'そのポケモンが描かれたポケふたを全部訪問するとコンプリートです。',
              '会えたポケモンの種類の数は、公開スタンプ帳の「ポケモン図鑑」に出ます。',
              `多くのポケモンは1枚だけなので、1回の訪問でコンプリートになります。集めがいがあるのは、${POKEMON_BADGE_MIN_MANHOLES}枚以上に描かれている次のポケモンです。`,
            ]}
          />
          <ul className="flex flex-wrap gap-2">
            {pokemon.map((p) => (
              <li key={p.name}>
                <a
                  href={pokemonDexUrl(p.name)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#7B63A8]/20 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#4F3828] hover:bg-white"
                >
                  {p.name}
                  <span className="rounded-full bg-[#7B63A8] px-1.5 font-pixel text-[10px] text-white">{p.total}枚</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* テーマ */}
        <section aria-labelledby="badges-themes" className="scroll-mt-20 space-y-4">
          <SectionHeading id="badges-themes" icon="🏷" title="テーマ制覇" where="スタンプ帳の「特徴」" />
          <Rules
            items={[
              '道の駅・海沿い・激レアなど、ポケふたに付いているテーマごとに、全部訪問すると制覇です。',
              `${THEME_MIN_MANHOLES}枚以上のテーマを並べています。ほかに「日本最北のポケふた」のような1枚だけのテーマもあります（全${themes.length}種類）。`,
            ]}
          />
          <ul className="flex flex-wrap gap-2">
            {shownThemes.map((t) => (
              <li
                key={t.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1f9d63]/25 bg-[#EEF8F2] px-3 py-1.5 text-xs font-bold text-[#1f7a4f]"
              >
                {t.name}
                <span className="font-pixel text-[10px] text-[#1f9d63]">{t.total}枚</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="rounded-[12px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-6 text-center">
          <p className="font-pixelJp text-base font-extrabold text-[#4F3828]">自分のバッジを確かめる</p>
          <p className="mt-1 text-xs text-[#6A4D36]">スタンプ帳で、制覇まであと少しの県・ポケモン・テーマが見られます。</p>
          <Link
            href="/visits"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#7B63A8] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_#5f55b8] transition hover:bg-[#6A5299]"
          >
            スタンプ帳を開く
          </Link>
        </div>
      </main>
    </PCShell>
  );
}
