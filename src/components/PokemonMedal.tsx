import { lidImageUrl, type BadgeRank } from '@/lib/badge-catalog';
import { RankMark, medalRing, medalShadow } from '@/components/RankMedal';

/**
 * ポケモンバッジのメダル。丸の中に代表マンホールの蓋の写真を入れる。
 *
 * - catalog: 説明ページ。カラーで見せる（どんなバッジかを見せるため）
 * - それ以外: 段（金・銀・銅）の色のリングで割合を見せる。銅に届くまでは白黒で薄くする
 */
export default function PokemonMedal({
  name,
  manholeId,
  rank,
  rate = 0,
  catalog = false,
  size = 64,
}: {
  name: string;
  manholeId: number;
  rank: BadgeRank | null;
  /** 回った割合（0〜100） */
  rate?: number;
  catalog?: boolean;
  size?: number;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full p-[3px] ${catalog ? 'shadow-sm' : medalShadow(rank)}`}
      style={{ width: size, height: size, background: catalog ? medalRing(null, 100) : medalRing(rank, rate) }}
    >
      <img
        src={lidImageUrl(manholeId)}
        alt={`${name}のポケふた`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`h-full w-full rounded-full border-2 border-white bg-[#EFE4CC] object-cover ${
          !catalog && !rank ? 'opacity-60 grayscale' : ''
        }`}
      />
      {!catalog && <RankMark rank={rank} />}
    </span>
  );
}
