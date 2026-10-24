import type { Metadata } from 'next';
import Link from 'next/link';
import PCShell from '@/components/PCShell';
import PokemonMedal from '@/components/PokemonMedal';
import RegularBadge from '@/components/RegularBadge';
import { MEDAL_STYLES, medalTier, type MedalTier } from '@/components/users/PrefectureBadgeShelf';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import {
  POKEMON_BADGE_MIN_MANHOLES,
  buildPokemonBadges,
  buildPrefectureBadges,
  buildThemeBadges,
  pokemonBadgeManholeIds,
  type BadgeManhole,
} from '@/lib/badge-catalog';
import { fetchPokemonRepresentatives } from '@/lib/pokemon-representatives';
import {
  REGULAR_BADGE_NAME,
  REGULAR_TIERS_ASCENDING,
  REGULAR_TIER_MIN_MANHOLES,
  fetchRegularSnapshot,
} from '@/lib/regular-badges';
import { prefectureDexUrl } from '@/lib/prefectureSlug';
import { pokemonDexUrl } from '@/lib/pokemonSlug';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `トレーナーカード｜称号・バッジ・ステッカーの条件 | ${SITE_NAME}`,
  description:
    'ポケふた写真館のトレーナーカードの説明です。訪問した枚数で上がる5段階の称号（ROOKIE〜LEGEND）、都道府県とポケモンのバッジ、1枚でもらえるステッカーの条件と、どこに表示されるかをまとめています。',
  alternates: { canonical: `${SITE_URL}/badges` },
  robots: { index: true, follow: true },
};

const X_URL = 'https://x.com/pokemonmanhole';

const MEDAL_LABEL: Record<MedalTier, string> = { gold: '金', silver: '銀', bronze: '銅' };
const MEDAL_RULE: Record<MedalTier, string> = {
  gold: 'ポケふたが20枚以上の県',
  silver: '5〜19枚の県',
  bronze: '4枚以下の県',
};

const shortPrefecture = (name: string) => (name === '北海道' ? name : name.replace(/[都府県]$/, ''));

// スタンプ帳（/visits）と同じ白いカード（細い枠・小さめの見出し）にそろえる
const CARD = 'scroll-mt-20 space-y-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm sm:p-5';

function SectionHeading({ id, icon, title, where }: { id: string; icon: string; title: string; where: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h2 id={id} className="flex items-center gap-1.5 font-pixelJp text-base font-bold text-[#4F3828]">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h2>
      <p className="font-pixelJp text-[10px] text-[#8C6A4A]">表示される場所: {where}</p>
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
  const [snapshot, representatives, regulars] = await Promise.all([
    fetchManholeSnapshot(),
    fetchPokemonRepresentatives(),
    fetchRegularSnapshot(),
  ]);
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
  const medalIds = pokemonBadgeManholeIds(manholes, representatives);
  const stickers = buildThemeBadges(manholes);

  return (
    <PCShell className="pb-32 pt-5 lg:pt-6">
      {/* 幅は PCShell の枠（PC 1120・ガター32）に合わせる。ほかのページと同じく本文に別の上限は付けない */}
      <main className="space-y-5">
        <header>
          <h1 className="font-pixelJp text-xl font-bold text-[#4F3828] sm:text-2xl">トレーナーカード</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6A4D36]">
            ポケふたを訪問して写真を登録すると、トレーナーカードに<b>称号</b>・<b>バッジ</b>・<b>ステッカー</b>が集まります。
            自分のカードはスタンプ帳、ほかの人のカードは公開スタンプ帳で見られます。
          </p>
          {/* 種類ごとに飛べる目次 */}
          <nav aria-label="トレーナーカードの中身" className="mt-3 flex flex-wrap gap-1.5">
            {[
              ['#badges-tiers', '🏆 称号'],
              ['#badges-prefectures', '🗾 都道府県バッジ'],
              ['#badges-pokemon', '⚡ ポケモンバッジ'],
              ['#badges-stickers', '🏷 ステッカー'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full border border-[#e9dfc7] bg-[#fffdf7] px-3 py-1 font-pixelJp text-xs font-bold text-[#6A4D36] hover:bg-[#e9dfc7]">
                {label}
              </a>
            ))}
          </nav>
        </header>

        <aside className="flex gap-2.5 rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-2.5">
          <span aria-hidden="true">🛠</span>
          <p className="text-xs leading-relaxed text-[#6A4D36]">
            <b className="text-[#B5483C]">トレーナーカードは調整中です。</b>
            名前や条件はこれから変わることがあります。「こんなバッジがほしい」というアイデアを
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="mx-0.5 font-bold text-[#B5483C] underline">
              X（@pokemonmanhole）
            </a>
            で募集しています。
          </p>
        </aside>

        {/* 称号 */}
        <section aria-labelledby="badges-tiers" className={CARD}>
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
                className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e9dfc7] bg-white px-3 py-2.5 sm:flex-col sm:items-center sm:py-4"
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
          {/* LEGEND に届いた人。順位にしないため枚数は出さず名前順（tracker の regulars.json の legends） */}
          <div id="badges-legend" className="scroll-mt-20 rounded-[10px] border border-[#e9dfc7] bg-[#FFF8E6] p-3">
            <p className="flex items-center gap-2 font-pixelJp text-sm font-extrabold text-[#4F3828]">
              <span aria-hidden="true">🏆</span>
              LEGEND を目指そう
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#6A4D36]">
              {regulars.legends.length > 0
                ? `ポケふたを${REGULAR_TIER_MIN_MANHOLES.legend}枚訪問した LEGEND のトレーナーは、いま${regulars.legends.length}人です。`
                : `ポケふたを${REGULAR_TIER_MIN_MANHOLES.legend}枚訪問すると LEGEND です。`}
            </p>
            {regulars.legends.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {regulars.legends.map((legend) => (
                  <li key={legend.id}>
                    <Link
                      href={`/users/${encodeURIComponent(legend.id)}/visits`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/60 bg-white px-3 py-1.5 text-xs font-bold text-[#4F3828] hover:bg-[#FBF6EA]"
                    >
                      <RegularBadge tier="legend" size="icon" />
                      {legend.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 都道府県制覇 */}
        <section aria-labelledby="badges-prefectures" className={CARD}>
          <SectionHeading id="badges-prefectures" icon="🗾" title="都道府県バッジ" where="公開スタンプ帳の「制覇した都道府県」" />
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
              <div key={region.region} className="border-t border-[#e9dfc7] pt-3">
                <h3 className="mb-2.5 font-pixelJp text-sm font-bold text-[#8C6A4A]">{region.region}</h3>
                <div className="grid grid-cols-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-9">
                  {region.prefectures.map((p) => (
                    <PrefectureMedal key={p.name} name={p.name} total={p.total} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ポケモン */}
        <section aria-labelledby="badges-pokemon" className={CARD}>
          <SectionHeading id="badges-pokemon" icon="⚡" title="ポケモンバッジ" where="公開スタンプ帳の「ポケモンバッジ」" />
          <Rules
            items={[
              `ポケふたに${POKEMON_BADGE_MIN_MANHOLES}枚以上描かれている${pokemon.length}種類のポケモンにあります。そのポケモンのポケふたを全部訪問するとバッジになります。`,
              'メダルの写真は、そのポケモンの代表のポケふたです。まだ集めていないバッジは白黒で、外側の輪が進み具合です。',
              '1〜2枚しかないポケモンは、公開スタンプ帳の「ポケモン図鑑」で会えた種類として数えます。',
            ]}
          />
          <ul className="grid grid-cols-4 gap-y-4 pt-1 sm:grid-cols-6 lg:grid-cols-11">
            {pokemon.map((p) => (
              <li key={p.name}>
                <a href={pokemonDexUrl(p.name)} className="group flex flex-col items-center text-center" title={`${p.name} 全${p.total}枚`}>
                  <span className="transition group-hover:scale-105">
                    <PokemonMedal name={p.name} manholeId={medalIds.get(p.name)!} state="catalog" total={p.total} size={60} />
                  </span>
                  <span className="mt-1 max-w-full truncate px-0.5 font-pixelJp text-[10px] font-bold text-[#4F3828]">{p.name}</span>
                  <span className="font-pixel text-[10px] text-[#8C6A4A]">{p.total}枚</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* ステッカー */}
        <section aria-labelledby="badges-stickers" className={CARD}>
          <SectionHeading id="badges-stickers" icon="🏷" title="ステッカー" where="公開スタンプ帳の「ステッカー」" />
          <Rules
            items={[
              'バッジは全部そろえるともらえますが、ステッカーは対象のポケふたを1枚でも訪問すればもらえます。',
              '日本最南と日本最西は同じポケふたなので、1回の訪問で2枚もらえます。',
            ]}
          />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {stickers.map((sticker) => (
              <li
                key={sticker.key}
                className="flex items-center gap-3 rounded-[10px] border border-dashed border-[#1f9d63]/40 bg-[#F3FBF6] px-3 py-2.5"
              >
                <span className="flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-[10px] bg-white text-2xl shadow" aria-hidden="true">
                  {sticker.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-pixelJp text-sm font-extrabold text-[#1f7a4f]">{sticker.name}</span>
                  <span className="block text-[10px] leading-snug text-[#4F6A58]">{sticker.description}</span>
                  <span className="block font-pixel text-[10px] text-[#1f9d63]">対象 {sticker.total}枚</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] px-5 py-5 text-center shadow-sm">
          <p className="font-pixelJp text-sm font-bold text-[#4F3828]">自分のトレーナーカードを見る</p>
          <p className="mt-1 text-xs text-[#6A4D36]">スタンプ帳で、いまの称号と、あと少しのバッジが見られます。</p>
          <Link
            href="/visits"
            className="mt-3 inline-flex items-center gap-2 rounded-[10px] bg-[#7B63A8] px-5 py-2.5 font-pixelJp text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
          >
            スタンプ帳を開く
          </Link>
        </div>
      </main>
    </PCShell>
  );
}
