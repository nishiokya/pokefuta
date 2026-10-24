import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import PokemonMedal from '@/components/PokemonMedal';
import type { BadgeProgress, ThemeBadgeProgress } from '@/lib/badge-catalog';
import { pokemonDexUrl } from '@/lib/pokemonSlug';

// あと何枚までを「リーチ」として見せるか。ポケモンバッジは3枚からなので、残り2枚までにする
const NEAR_COMPLETE_THRESHOLD = 2;
const NEAR_COMPLETE_LIMIT = 6;

type PokemonBadgeShelfProps = {
  pokemon: BadgeProgress[];
  /** ポケモン名 → メダルに入れる蓋の id */
  medalIds: Record<string, number>;
  stickers: ThemeBadgeProgress[];
};

/**
 * 公開スタンプ帳の「ポケモンバッジ」と「ステッカー」の棚。都道府県の棚（PrefectureBadgeShelf）の下に置く。
 * 取ったバッジはカラー＋金の縁、あと少しのものは白黒で輪が進み具合。ステッカーは取ったものだけ並べる。
 */
export default function PokemonBadgeShelf({ pokemon, medalIds, stickers }: PokemonBadgeShelfProps) {
  const earned = pokemon.filter((p) => p.visited >= p.total);
  const near = pokemon
    .filter((p) => p.visited > 0 && p.visited < p.total && p.total - p.visited <= NEAR_COMPLETE_THRESHOLD)
    .sort((a, b) => a.total - a.visited - (b.total - b.visited) || b.total - a.total)
    .slice(0, NEAR_COMPLETE_LIMIT);
  const earnedStickers = stickers.filter((s) => s.earned);

  if (earned.length === 0 && near.length === 0 && earnedStickers.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#4F3828]">
          <Sparkles className="h-5 w-5 text-[#7B63A8]" />
          ポケモンバッジ
        </h2>
        <p className="flex items-baseline gap-3 font-pixel text-sm text-[#7B63A8]">
          <span>
            {earned.length}
            <span className="text-[#8C6A4A]">/{pokemon.length}</span>
          </span>
          <Link href="/badges#badges-pokemon" className="font-pixelJp text-xs font-bold">バッジとは ›</Link>
        </p>
      </div>

      {earned.length > 0 && (
        <ul className="grid grid-cols-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-8">
          {earned.map((p) => (
            <li key={p.name}>
              <a href={pokemonDexUrl(p.name)} className="flex flex-col items-center text-center" title={`${p.name} ${p.total}枚コンプリート`}>
                <PokemonMedal name={p.name} manholeId={medalIds[p.name]} state="earned" visited={p.visited} total={p.total} size={56} />
                <span className="mt-1 max-w-full truncate font-pixelJp text-[10px] font-bold text-[#4F3828]">{p.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {near.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 font-pixelJp text-sm font-bold text-[#4F3828]">あと少し</h3>
          <ul className="grid grid-cols-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-8">
            {near.map((p) => (
              <li key={p.name}>
                <a href={pokemonDexUrl(p.name)} className="flex flex-col items-center text-center" title={`${p.name} ${p.visited}/${p.total}枚`}>
                  <PokemonMedal name={p.name} manholeId={medalIds[p.name]} state="progress" visited={p.visited} total={p.total} size={56} />
                  <span className="mt-1 max-w-full truncate font-pixelJp text-[10px] font-bold text-[#4F3828]">{p.name}</span>
                  <span className="font-pixel text-[10px] text-[#B5483C]">あと{p.total - p.visited}枚</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {earnedStickers.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 font-pixelJp text-sm font-bold text-[#4F3828]">ステッカー</h3>
          <ul className="flex flex-wrap gap-2">
            {earnedStickers.map((sticker) => (
              <li
                key={sticker.key}
                className="inline-flex -rotate-1 items-center gap-1.5 rounded-[8px] border-2 border-dashed border-[#1f9d63]/40 bg-[#F3FBF6] px-2.5 py-1 text-xs font-extrabold text-[#1f7a4f] shadow-sm"
                title={sticker.description}
              >
                <span aria-hidden="true">{sticker.icon}</span>
                {sticker.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
