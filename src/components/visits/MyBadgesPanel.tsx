import Link from 'next/link';
import PokemonMedal from '@/components/PokemonMedal';
import RegularBadge from '@/components/RegularBadge';
import { MEDAL_STYLES, medalTier } from '@/components/users/PrefectureBadgeShelf';
import {
  buildPokemonBadges,
  buildPrefectureBadges,
  buildThemeBadges,
  pokemonBadgeManholeIds,
  type BadgeManhole,
} from '@/lib/badge-catalog';
import {
  REGULAR_BADGE_ICON,
  REGULAR_BADGE_NAME,
  REGULAR_TIER_MIN_MANHOLES,
  regularTierForCount,
} from '@/lib/regular-badges';

// 「あと少し」に出す残り枚数（ポケモンバッジは3枚からなので2枚まで、都道府県は棚と同じ3枚まで）
const NEAR_POKEMON = 2;
const NEAR_PREFECTURE = 3;
const NEAR_LIMIT = 8;
const MEDAL_SIZE = 48;

const shortPrefecture = (name: string) => (name === '北海道' ? name : name.replace(/[都府県]$/, ''));

/** 都道府県バッジのメダル。ポケモンのメダルと同じ大きさで、縁の色は県の枚数の金・銀・銅 */
function PrefectureMedal({ name, total, visited }: { name: string; total: number; visited: number }) {
  const earned = visited >= total;
  const style = MEDAL_STYLES[medalTier(total)];
  const label = shortPrefecture(name);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br p-[3px] ${style.medal} ${
        earned ? 'shadow-[0_2px_6px_rgba(120,90,40,0.35)]' : 'opacity-50 grayscale'
      }`}
      style={{ width: MEDAL_SIZE, height: MEDAL_SIZE }}
    >
      <span className={`flex h-full w-full items-center justify-center rounded-full bg-white/90 text-center font-pixelJp font-extrabold leading-tight text-[#4F3828] ${label.length >= 4 ? 'text-[9px]' : 'text-[11px]'}`}>
        {label}
      </span>
      {earned && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#FFF3CF] text-[9px] shadow" aria-hidden="true">
          🏅
        </span>
      )}
    </span>
  );
}

type MyBadgesPanelProps = {
  manholes: readonly BadgeManhole[];
  /** 訪問した蓋（非公開も含む）。都道府県・ポケモン・ステッカーに使う */
  visited: ReadonlySet<number>;
  /** 公開で訪問した蓋の枚数。称号はこれで決まる（tracker の日次判定と同じ数え方） */
  publicCount: number;
  representatives: ReadonlyMap<string, number>;
};

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-pixelJp text-xs font-extrabold text-[#4F3828]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * 自分のスタンプ帳のバッジとステッカー。PC は右レール、スマホは「バッジ」タブ（/visits/badges）に出す。
 * 都道府県バッジはここでは今の訪問から数える（公開スタンプ帳の棚は「取った日」を持っていて新設で消えない）。
 */
export default function MyBadgesPanel({ manholes, visited, publicCount, representatives }: MyBadgesPanelProps) {
  const tier = regularTierForCount(publicCount);
  const prefectures = buildPrefectureBadges(manholes, visited).flatMap((region) => region.prefectures);
  const earnedPrefectures = prefectures.filter((p) => p.visited >= p.total);
  const nearPrefectures = prefectures
    .filter((p) => p.visited > 0 && p.visited < p.total && p.total - p.visited <= NEAR_PREFECTURE)
    .sort((a, b) => a.total - a.visited - (b.total - b.visited) || b.total - a.total)
    .slice(0, NEAR_LIMIT);
  const pokemon = buildPokemonBadges(manholes, visited);
  const earnedPokemon = pokemon.filter((p) => p.visited >= p.total);
  const nearPokemon = pokemon
    .filter((p) => p.visited > 0 && p.visited < p.total && p.total - p.visited <= NEAR_POKEMON)
    .sort((a, b) => a.total - a.visited - (b.total - b.visited) || b.total - a.total)
    .slice(0, NEAR_LIMIT);
  const medalIds = pokemonBadgeManholeIds(manholes, representatives);
  const stickers = buildThemeBadges(manholes, visited);

  const nextRate = tier.next
    ? Math.max(
        0,
        Math.min(
          100,
          ((publicCount - (tier.current ? REGULAR_TIER_MIN_MANHOLES[tier.current] : 0)) /
            (REGULAR_TIER_MIN_MANHOLES[tier.next] - (tier.current ? REGULAR_TIER_MIN_MANHOLES[tier.current] : 0))) *
            100,
        ),
      )
    : 100;

  return (
    <div className="space-y-3">
      <Card title="称号" right={<Link href="/badges" className="font-pixelJp text-[10px] font-bold text-[#B5483C]">バッジとは ›</Link>}>
        <div className="flex items-center gap-2">
          {tier.current ? <RegularBadge tier={tier.current} size="md" /> : <span className="text-xs text-[#8C6A4A]">まだありません</span>}
          <span className="font-pixelJp text-xs text-[#6A4D36]">公開 <b className="font-pixel text-sm text-[#4F3828]">{publicCount}</b>枚</span>
        </div>
        {tier.next ? (
          <>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EADFC8]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#7B63A8] to-[#B5483C]" style={{ width: `${nextRate}%` }} />
            </div>
            <p className="mt-1 font-pixelJp text-[10px] text-[#6A4D36]">
              次の {REGULAR_BADGE_ICON[tier.next]} {REGULAR_BADGE_NAME[tier.next]} まで あと
              <b className="mx-0.5 font-pixel text-[#B5483C]">{REGULAR_TIER_MIN_MANHOLES[tier.next] - publicCount}</b>枚
            </p>
          </>
        ) : (
          <p className="mt-1 font-pixelJp text-[10px] font-bold text-[#B5483C]">いちばん上の段です 🎉</p>
        )}
      </Card>

      <Card
        title="都道府県バッジ"
        right={<span className="font-pixel text-xs text-[#B5483C]">{earnedPrefectures.length}<span className="text-[#8C6A4A]">/{prefectures.length}</span></span>}
      >
        {earnedPrefectures.length === 0 && nearPrefectures.length === 0 ? (
          <p className="font-pixelJp text-[10px] text-[#8C6A4A]">県のポケふたを全部訪問すると、ここに並びます。</p>
        ) : (
          <ul className="grid grid-cols-4 gap-y-2">
            {[...earnedPrefectures, ...nearPrefectures].map((p) => {
              const earned = p.visited >= p.total;
              return (
                <li key={p.name} className="flex flex-col items-center text-center" title={`${p.name} ${p.visited}/${p.total}枚`}>
                  <PrefectureMedal name={p.name} total={p.total} visited={p.visited} />
                  {!earned && <span className="mt-0.5 font-pixel text-[9px] text-[#B5483C]">あと{p.total - p.visited}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="ポケモンバッジ"
        right={<span className="font-pixel text-xs text-[#7B63A8]">{earnedPokemon.length}<span className="text-[#8C6A4A]">/{pokemon.length}</span></span>}
      >
        {earnedPokemon.length === 0 && nearPokemon.length === 0 ? (
          <p className="font-pixelJp text-[10px] text-[#8C6A4A]">3枚以上あるポケモンのポケふたを全部訪問すると、バッジになります。</p>
        ) : (
          <ul className="grid grid-cols-4 gap-y-2">
            {[...earnedPokemon, ...nearPokemon].map((p) => {
              const earned = p.visited >= p.total;
              return (
                <li key={p.name} className="flex flex-col items-center text-center" title={`${p.name} ${p.visited}/${p.total}枚`}>
                  <PokemonMedal name={p.name} manholeId={medalIds.get(p.name)!} state={earned ? 'earned' : 'progress'} visited={p.visited} total={p.total} size={MEDAL_SIZE} />
                  <span className="mt-0.5 max-w-full truncate font-pixelJp text-[9px] font-bold text-[#4F3828]">{p.name}</span>
                  {!earned && <span className="font-pixel text-[9px] text-[#B5483C]">あと{p.total - p.visited}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="ステッカー" right={<span className="font-pixel text-xs text-[#1f9d63]">{stickers.filter((s) => s.earned).length}/{stickers.length}</span>}>
        <ul className="flex flex-wrap gap-1.5">
          {stickers.map((sticker) => (
            <li
              key={sticker.key}
              title={sticker.description}
              className={`inline-flex items-center gap-1 rounded-[8px] border-2 border-dashed px-2 py-0.5 font-pixelJp text-[10px] font-extrabold ${
                sticker.earned
                  ? '-rotate-1 border-[#1f9d63]/40 bg-[#F3FBF6] text-[#1f7a4f] shadow-sm'
                  : 'border-[#8C6A4A]/20 bg-white/60 text-[#B9A88C] grayscale'
              }`}
            >
              <span aria-hidden="true">{sticker.icon}</span>
              {sticker.name}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
