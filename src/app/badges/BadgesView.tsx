'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PCShell from '@/components/PCShell';
import RegularBadge from '@/components/RegularBadge';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  POKEMON_BADGE_MIN_MANHOLES,
  buildPokemonBadges,
  buildPrefectureBadges,
  type BadgeManhole,
  type BadgeProgress,
} from '@/lib/badge-catalog';
import {
  REGULAR_BADGE_NAME,
  REGULAR_TIERS_ASCENDING,
  REGULAR_TIER_MIN_MANHOLES,
  regularTierForCount,
} from '@/lib/regular-badges';
import { prefectureDexUrl } from '@/lib/prefectureSlug';
import { pokemonDexUrl } from '@/lib/pokemonSlug';

const X_URL = 'https://x.com/pokemonmanhole';

type Mine = {
  /** 訪問した蓋（非公開も含む）。県・ポケモンのバッジに使う */
  visited: Set<number>;
  /** 公開で訪問した蓋の枚数。称号はこれで決まる */
  publicCount: number;
};

/** ログインしている人の訪問を読む。未ログインなら null のまま（条件だけを見せる） */
function useMine(): Mine | null {
  const [mine, setMine] = useState<Mine | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await createBrowserClient().auth.getSession();
        if (!session?.user) return;
        const res = await fetch('/api/visits?limit=1000');
        if (!res.ok) return;
        const body = await res.json();
        const visits: Array<{ is_public?: boolean; manhole?: { id?: number } | null; manhole_id?: number | null }> =
          body?.success && Array.isArray(body.visits) ? body.visits : [];
        const visited = new Set<number>();
        const publicIds = new Set<number>();
        for (const visit of visits) {
          const id = visit.manhole?.id ?? visit.manhole_id;
          if (typeof id !== 'number') continue;
          visited.add(id);
          if (visit.is_public) publicIds.add(id);
        }
        if (!cancelled) setMine({ visited, publicCount: publicIds.size });
      } catch {
        // 進み具合は飾り。取れなければ条件だけを見せる
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return mine;
}

function ProgressChip({ badge, href, loggedIn }: { badge: BadgeProgress; href: string | null; loggedIn: boolean }) {
  const done = loggedIn && badge.visited >= badge.total;
  const rate = badge.total > 0 ? Math.min(100, (badge.visited / badge.total) * 100) : 0;
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate font-bold">{done ? '🏅 ' : ''}{badge.name}</span>
        <span className="shrink-0 font-pixel text-[11px] text-[#8C6A4A]">
          {loggedIn ? `${badge.visited}/${badge.total}` : `全${badge.total}枚`}
        </span>
      </span>
      {loggedIn && (
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#F1E6CF]">
          <span className={`block h-full ${done ? 'bg-[#D9A21B]' : 'bg-[#B5483C]/70'}`} style={{ width: `${rate}%` }} />
        </span>
      )}
    </>
  );
  const className = `block rounded-lg border px-2.5 py-2 text-xs text-[#4F3828] ${
    done ? 'border-[#D9A21B]/60 bg-[#FFF3CF]' : 'border-[#8C6A4A]/15 bg-white/70'
  }`;
  return href ? (
    <a href={href} className={`${className} hover:bg-white`}>{body}</a>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default function BadgesView({ manholes }: { manholes: BadgeManhole[] }) {
  const mine = useMine();
  const loggedIn = mine !== null;
  const visited = mine?.visited;

  const regions = useMemo(() => buildPrefectureBadges(manholes, visited), [manholes, visited]);
  const pokemon = useMemo(() => buildPokemonBadges(manholes, visited), [manholes, visited]);
  const prefectureCount = regions.reduce((sum, region) => sum + region.prefectures.length, 0);
  const completedPrefectures = regions.reduce(
    (sum, region) => sum + region.prefectures.filter((p) => p.visited >= p.total).length,
    0,
  );
  const tier = mine ? regularTierForCount(mine.publicCount) : null;

  return (
    <PCShell className="pb-32 pt-5 lg:pt-6">
      <main className="mx-auto max-w-3xl space-y-8">
        <header>
          <h1 className="font-pixelJp text-2xl font-extrabold text-[#4F3828]">バッジ一覧</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6A4D36]">
            ポケふたを訪問して写真を投稿すると、称号・都道府県バッジ・ポケモンバッジが集まります。
            {loggedIn ? 'あなたの進み具合も表示しています。' : 'ログインすると、あなたの進み具合が表示されます。'}
          </p>
        </header>

        <section className="rounded-xl border-2 border-dashed border-[#B5483C]/40 bg-[#FFF8EB] p-4">
          <h2 className="font-pixelJp text-sm font-bold text-[#B5483C]">🛠 バッジは調整中です</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6A4D36]">
            2026年10月から、バッジの種類と条件を見直しています。名前や条件はこれから変わることがあります。
            「こんなバッジがほしい」というアイデアを
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-[#B5483C] underline">
              X（@pokemonmanhole）
            </a>
            で募集しています。
          </p>
        </section>

        <section aria-labelledby="badges-tiers">
          <h2 id="badges-tiers" className="font-pixelJp text-lg font-extrabold text-[#4F3828]">称号（5段階）</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6A4D36]">
            公開で訪問したポケふたの枚数（同じポケふたは1枚）で上がります。投稿者の名前の横に表示されます。反映は翌朝です。
          </p>
          {tier && (
            <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-[#4F3828]">
              あなたは公開で <b className="font-pixel">{mine!.publicCount}</b> 枚
              {tier.next
                ? `。次の ${REGULAR_BADGE_NAME[tier.next]} まであと ${REGULAR_TIER_MIN_MANHOLES[tier.next] - mine!.publicCount} 枚`
                : '。いちばん上の段に届いています'}
            </p>
          )}
          <ol className="mt-3 grid gap-2 sm:grid-cols-5">
            {REGULAR_TIERS_ASCENDING.map((t) => {
              const reached = tier?.current
                ? REGULAR_TIERS_ASCENDING.indexOf(t) <= REGULAR_TIERS_ASCENDING.indexOf(tier.current)
                : false;
              return (
                <li
                  key={t}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 sm:flex-col sm:items-start ${
                    reached ? 'border-[#D9A21B]/60 bg-[#FFF3CF]' : 'border-[#8C6A4A]/15 bg-white/70'
                  }`}
                >
                  <RegularBadge tier={t} size="md" />
                  <span className="font-pixel text-xs text-[#4F3828]">{REGULAR_TIER_MIN_MANHOLES[t]}枚以上</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="badges-prefectures">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="badges-prefectures" className="font-pixelJp text-lg font-extrabold text-[#4F3828]">都道府県バッジ</h2>
            {loggedIn && (
              <span className="font-pixel text-sm text-[#B5483C]">
                {completedPrefectures}<span className="text-[#8C6A4A]">/{prefectureCount}</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#6A4D36]">
            その県のポケふたを全部訪問すると制覇です（ポケふたのある{prefectureCount}都道府県）。全部の県を制覇すると全国制覇。
            制覇したバッジは、あとで新しいポケふたが増えても公開スタンプ帳から消えません。
          </p>
          <div className="mt-3 space-y-4">
            {regions.map((region) => (
              <div key={region.region}>
                <h3 className="mb-1.5 font-pixelJp text-sm font-bold text-[#8C6A4A]">{region.region}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {region.prefectures.map((p) => (
                    <ProgressChip key={p.name} badge={p} href={prefectureDexUrl(p.name)} loggedIn={loggedIn} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="badges-pokemon">
          <h2 id="badges-pokemon" className="font-pixelJp text-lg font-extrabold text-[#4F3828]">ポケモンバッジ</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6A4D36]">
            ポケふたに{POKEMON_BADGE_MIN_MANHOLES}枚以上描かれているポケモンは、そのポケモンのポケふたを全部訪問するとバッジになります。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {pokemon.map((p) => (
              <ProgressChip key={p.name} badge={p} href={pokemonDexUrl(p.name)} loggedIn={loggedIn} />
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-[#8C6A4A]">
          <Link href="/visits" className="font-bold text-[#B5483C] underline">スタンプ帳</Link>
          で、制覇まであと少しの県やポケモンを確かめられます。
        </p>
      </main>
    </PCShell>
  );
}
