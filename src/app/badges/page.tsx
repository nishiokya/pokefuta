import type { Metadata } from 'next';
import Link from 'next/link';
import PCShell from '@/components/PCShell';
import PokemonMedal from '@/components/PokemonMedal';
import RegularBadge from '@/components/RegularBadge';
import RankSimulator from '@/components/badges/RankSimulator';
import { PrefectureMedal, RANK_ICON, RANK_LABEL } from '@/components/RankMedal';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import {
  badgeRankThresholds,
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

// 説明ページに並べるポケモンの数。全種類にバッジがあるが、全部並べると数百になるのでポケふたの多い順に先頭だけ
const POKEMON_SAMPLE = 22;
// 段の決まり方の例に出す枚数
const RANK_EXAMPLES = [1, 2, 5, 9, 50];

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

/** 県のメダルと、その県の銅・銀・金に要る枚数 */
function CatalogPrefecture({ name, total }: { name: string; total: number }) {
  const t = badgeRankThresholds(total);
  const href = prefectureDexUrl(name);
  const body = (
    <>
      <span className="transition group-hover:scale-105">
        {/* 説明なので段の色は付けず、ポケモンのメダルの説明と同じ紫の輪にする */}
        <PrefectureMedal label={shortPrefecture(name)} rank={null} rate={100} size={56} />
      </span>
      <span className="mt-1 font-pixel text-[10px] text-[#8C6A4A]">{total}枚</span>
    </>
  );
  const title = `${name} 全${total}枚（銅${t.bronze}・銀${t.silver}・金${t.gold}枚）`;
  return href ? (
    <a href={href} className="group flex flex-col items-center" title={title}>{body}</a>
  ) : (
    <span className="flex flex-col items-center" title={title}>{body}</span>
  );
}

/** 全部の枚数ごとに、銅・銀・金に要る枚数 */
function RankTable() {
  return (
    <table className="w-full max-w-md border-collapse text-center text-xs text-[#4F3828]">
      <thead>
        <tr className="border-b border-[#e9dfc7] font-pixelJp text-[#8C6A4A]">
          <th className="py-1.5 font-bold">全部の枚数</th>
          {(['bronze', 'silver', 'gold'] as const).map((rank) => (
            <th key={rank} className="py-1.5 font-bold">{RANK_ICON[rank]} {RANK_LABEL[rank]}</th>
          ))}
        </tr>
      </thead>
      <tbody className="font-pixel">
        {RANK_EXAMPLES.map((total) => {
          const t = badgeRankThresholds(total);
          return (
            <tr key={total} className="border-b border-[#e9dfc7]/60">
              <td className="py-1.5">{total}枚</td>
              {/* 銅と銀が同じ枚数になるとき（2枚以下）は、上の段だけ出す */}
              <td className="py-1.5">{t.bronze < t.silver ? `${t.bronze}枚` : '—'}</td>
              <td className="py-1.5">{t.silver < t.gold ? `${t.silver}枚` : '—'}</td>
              <td className="py-1.5">{t.gold}枚</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
              ['#badges-rank', '🥇 金・銀・銅'],
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
              '2026年10月25日に線を上げました（RANGER 30→50枚、MASTER 50→100枚、LEGEND 100→150枚）。それまでに届いた称号はそのままです。',
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
                ? `LEGEND のトレーナーは、いま${regulars.legends.length}人です。ポケふたを${REGULAR_TIER_MIN_MANHOLES.legend}枚訪問すると LEGEND です。`
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

        {/* 都道府県・ポケモンのバッジは同じ決まり（何割回ったかで銅・銀・金） */}
        <section aria-labelledby="badges-rank" className={CARD}>
          <SectionHeading id="badges-rank" icon="🥇" title="バッジの段（金・銀・銅）" where="スタンプ帳・公開スタンプ帳の「バッジ」" />
          <Rules
            items={[
              'バッジは都道府県ごと・ポケモンごとにあります。そのポケふたを何枚訪問したかで、銅・銀・金の3段に上がります。',
              '全部の1/3で銅、2/3で銀、全部訪問すると金です（端数は切り捨て、少なくとも1枚）。',
              '銅に届くまでは白黒で、外側の輪が進み具合です。同じポケふたに何度行っても1枚です。',
            ]}
          />
          <RankTable />
          <RankSimulator />
        </section>

        {/* 都道府県 */}
        <section aria-labelledby="badges-prefectures" className={CARD}>
          <SectionHeading id="badges-prefectures" icon="🗾" title="都道府県バッジ" where="スタンプ帳・公開スタンプ帳の「都道府県バッジ」" />
          <Rules
            items={[
              `ポケふたのある${prefectureCount}都道府県にあります。`,
              '公開スタンプ帳では、一度金になった県は、あとで新しいポケふたが増えても金のままです。増えた枚数が「+N」で付き、また全部訪問すると金が2つ（🥇×2）になります。',
            ]}
          />
          <div className="space-y-3">
            {regions.map((region) => (
              <div key={region.region} className="border-t border-[#e9dfc7] pt-3">
                <h3 className="mb-2.5 font-pixelJp text-sm font-bold text-[#8C6A4A]">{region.region}</h3>
                <div className="grid grid-cols-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-9">
                  {region.prefectures.map((p) => (
                    <CatalogPrefecture key={p.name} name={p.name} total={p.total} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ポケモン */}
        <section aria-labelledby="badges-pokemon" className={CARD}>
          <SectionHeading id="badges-pokemon" icon="⚡" title="ポケモンバッジ" where="スタンプ帳・公開スタンプ帳の「ポケモンバッジ」" />
          <Rules
            items={[
              `ポケふたに描かれている${pokemon.length}種類のポケモン全部にあります。1枚しかないポケモンは、その1枚で金です。`,
              'メダルの写真は、そのポケモンの代表のポケふたです。',
            ]}
          />
          <p className="font-pixelJp text-xs font-bold text-[#8C6A4A]">ポケふたが多いポケモン</p>
          <ul className="grid grid-cols-4 gap-y-4 pt-1 sm:grid-cols-6 lg:grid-cols-11">
            {pokemon.slice(0, POKEMON_SAMPLE).map((p) => (
              <li key={p.name}>
                <a href={pokemonDexUrl(p.name)} className="group flex flex-col items-center text-center" title={`${p.name} 全${p.total}枚`}>
                  <span className="transition group-hover:scale-105">
                    <PokemonMedal name={p.name} manholeId={medalIds.get(p.name)!} rank={null} catalog size={60} />
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
              'バッジは訪問した割合で銅・銀・金に上がりますが、ステッカーは対象のポケふたを1枚でも訪問すればもらえます。',
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
          <p className="mt-1 text-xs text-[#6A4D36]">スタンプ帳で、いまの称号と、都道府県・ポケモンのバッジが見られます。</p>
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
