import Link from 'next/link';

/**
 * 自分のスタンプ帳の「スタンプ（/visits）/ 旅の記録（/visits/trip）/ カード（/visits/badges、トレーナーカード）」の切り替え。
 *
 * 旅の記録は以前の マイ旅（/my-trip）。同じページ内のタブにせずルートを分けているのは、
 * URL・戻る/進む・GA4 の page_view をルーターに任せるため（タブにすると ?tab と表示の
 * 同期を自前で持つことになり、PR #356 の途中で実際にずれた）。
 *
 * カードはスマホだけのタブ。PC はスタンプの右レールにトレーナーカード（称号・バッジ・ステッカー）が出ているので、タブは出さない。
 * 「コレクション」は 2026-10-24 に「スタンプ」へ改名した（都道府県・ポケモンのコレクション一覧を外したため）。
 *
 * 表示だけの部品。データは各ページが自分で取る。
 */
export default function VisitsSwitcher({ current }: { current: 'collection' | 'trip' | 'badges' }) {
  const items = [
    { key: 'collection', label: 'スタンプ', href: '/visits', className: '' },
    { key: 'trip', label: '旅の記録', href: '/visits/trip', className: '' },
    { key: 'badges', label: 'カード', href: '/visits/badges', className: 'lg:hidden' },
  ] as const;

  return (
    <nav aria-label="スタンプ帳の表示" className="flex gap-1.5 rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] p-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? 'page' : undefined}
          className={`flex min-h-[40px] flex-1 items-center justify-center rounded-[9px] font-pixelJp text-sm font-bold transition-colors ${item.className} ${
            current === item.key ? 'bg-[#7B63A8] text-white' : 'text-[#6A4D36] hover:bg-[#e9dfc7]'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
