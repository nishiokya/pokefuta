import Link from 'next/link';
import RegularBadge from '@/components/RegularBadge';
import { RANK_ICON, RANK_LABEL } from '@/components/RankMedal';
import {
  badgeRank,
  buildPokemonBadges,
  buildPrefectureBadges,
  type BadgeManhole,
  type BadgeProgress,
  type BadgeRank,
} from '@/lib/badge-catalog';
import {
  REGULAR_BADGE_ICON,
  REGULAR_BADGE_NAME,
  REGULAR_TIER_MIN_MANHOLES,
  regularTierForCount,
} from '@/lib/regular-badges';

const RANKS: BadgeRank[] = ['gold', 'silver', 'bronze'];

/** 金・銀・銅の数。一覧はスタンプ帳（/visits）のスタンプの下にある */
function RankSummary({ items }: { items: readonly BadgeProgress[] }) {
  const ranks = items.map((p) => badgeRank(p.visited, p.total));
  return (
    <div className="flex items-center gap-3">
      {RANKS.map((rank) => (
        <span key={rank} className="flex items-baseline gap-1 font-pixelJp text-xs text-[#6A4D36]">
          <span aria-hidden="true">{RANK_ICON[rank]}</span>
          {RANK_LABEL[rank]}
          <b className="font-pixel text-sm text-[#4F3828]">{ranks.filter((r) => r === rank).length}</b>
        </span>
      ))}
    </div>
  );
}

type MyBadgesPanelProps = {
  manholes: readonly BadgeManhole[];
  /** 訪問した蓋（非公開も含む）。都道府県・ポケモンに使う */
  visited: ReadonlySet<number>;
  /** 公開で訪問した蓋の枚数。称号はこれで決まる（tracker の日次判定と同じ数え方） */
  publicCount: number;
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
 * 自分のスタンプ帳の称号・バッジ（ステッカーはスタンプの下）。PC は右レール、スマホは「バッジ」タブ（/visits/badges）に出す。
 * 都道府県バッジはここでは今の訪問から数える（公開スタンプ帳は「取った日」を持っていて、新設で金が消えない）。
 */
export default function MyBadgesPanel({ manholes, visited, publicCount }: MyBadgesPanelProps) {
  const tier = regularTierForCount(publicCount);
  const prefectures = buildPrefectureBadges(manholes, visited).flatMap((region) => region.prefectures).filter((p) => p.visited > 0);
  const pokemon = buildPokemonBadges(manholes, visited).filter((p) => p.visited > 0);

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
      <Card title="称号" right={<Link href="/badges" className="font-pixelJp text-[10px] font-bold text-[#B5483C]">トレーナーカードとは ›</Link>}>
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

      {/* 都道府県・ポケモンのバッジは、メダルの一覧をスタンプ帳のスタンプの下に置き、ここは金・銀・銅の数だけにする */}
      <Card title="都道府県バッジ" right={<Link href="/visits#badges" className="font-pixelJp text-[10px] font-bold text-[#B5483C]">一覧 ›</Link>}>
        <RankSummary items={prefectures} />
      </Card>

      <Card title="ポケモンバッジ" right={<Link href="/visits#badges" className="font-pixelJp text-[10px] font-bold text-[#B5483C]">一覧 ›</Link>}>
        <RankSummary items={pokemon} />
      </Card>
    </div>
  );
}
