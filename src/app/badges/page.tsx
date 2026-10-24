import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import type { BadgeManhole } from '@/lib/badge-catalog';
import BadgesView from './BadgesView';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `バッジ一覧｜すべてのバッジと条件 | ${SITE_NAME}`,
  description:
    'ポケふたを訪問して集めるバッジの一覧です。訪問した枚数で上がる5段階の称号（ROOKIE〜LEGEND）、都道府県バッジ、ポケモンバッジの条件と、あなたの進み具合を確かめられます。',
  alternates: { canonical: `${SITE_URL}/badges` },
  robots: { index: true, follow: true },
};

/**
 * バッジ一覧。条件はサーバで描いて検索にも出し、ログインしている人の進み具合はブラウザで重ねる。
 * 蓋の一覧は data.pokefuta.com のスナップショット（Supabase を読まない）。
 */
export default async function BadgesPage() {
  const snapshot = await fetchManholeSnapshot();
  const manholes: BadgeManhole[] = (snapshot?.manholes ?? []).map((m) => ({
    id: m.id,
    prefecture: m.prefecture,
    pokemons: m.pokemons,
  }));
  return <BadgesView manholes={manholes} />;
}
