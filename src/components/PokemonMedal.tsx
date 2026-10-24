import { lidImageUrl } from '@/lib/badge-catalog';

/**
 * ポケモンバッジのメダル。丸の中に代表マンホールの蓋の写真を入れる。
 *
 * - catalog: 説明ページ。カラーで見せる（どんなバッジかを見せるため）
 * - earned: 取ったバッジ。カラー＋金の縁
 * - progress: まだ取っていない。白黒で薄くし、外周のリングで進み具合を見せる
 */
export type PokemonMedalState = 'catalog' | 'earned' | 'progress';

export default function PokemonMedal({
  name,
  manholeId,
  state,
  visited = 0,
  total,
  size = 64,
}: {
  name: string;
  manholeId: number;
  state: PokemonMedalState;
  visited?: number;
  total: number;
  size?: number;
}) {
  const rate = total > 0 ? Math.min(100, (visited / total) * 100) : 0;
  const ring =
    state === 'earned'
      ? 'conic-gradient(#E5B83E 100%, transparent 0)'
      : state === 'progress'
        ? `conic-gradient(#7B63A8 ${rate}%, #EADFC8 0)`
        : 'conic-gradient(#7B63A8 100%, transparent 0)';
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full p-[3px] ${
        state === 'earned' ? 'shadow-[0_0_0_2px_#F5D77A,0_4px_10px_rgba(217,162,27,0.35)]' : 'shadow-sm'
      }`}
      style={{ width: size, height: size, background: ring }}
    >
      <img
        src={lidImageUrl(manholeId)}
        alt={`${name}のポケふた`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`h-full w-full rounded-full border-2 border-white bg-[#EFE4CC] object-cover ${
          state === 'progress' ? 'opacity-60 grayscale' : ''
        }`}
      />
      {state === 'earned' && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFF3CF] text-[11px] shadow" aria-hidden="true">
          🏅
        </span>
      )}
    </span>
  );
}
