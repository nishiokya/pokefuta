'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MapPin, Stamp, BookOpen } from 'lucide-react';

type NavTab = 'search' | 'stamp' | 'mytrip';

interface NavItem {
  key: NavTab;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'search', label: '探す', href: '/nearby', Icon: MapPin },
  { key: 'stamp', label: 'スタンプ帳', href: '/visits', Icon: Stamp },
  { key: 'mytrip', label: 'マイ旅', href: '/my-trip', Icon: BookOpen },
];

interface PCTopNavProps {
  active?: NavTab;
}

function PCTopNav({ active }: PCTopNavProps) {
  const pathname = usePathname();
  const resolveActive = (key: NavTab, href: string): boolean => {
    if (active) return active === key;
    return pathname.startsWith(href);
  };

  return (
    <nav className="hidden lg:flex items-center justify-between px-8 py-[14px] border-b border-[#e9dfc7] bg-[#fffdf7]">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <span className="font-pixel text-[#4F3828] text-base font-bold tracking-wide">pokefuta</span>
      </Link>
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map(({ key, label, href, Icon }) => {
          const isActive = resolveActive(key, href);
          return (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                isActive
                  ? 'bg-[#bf5640] text-white'
                  : 'text-[#4F3828] hover:bg-[#efe6cf]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

interface PCShellProps {
  /** アクティブなタブ（省略時はパスから自動判定） */
  active?: NavTab;
  children: React.ReactNode;
  /** 右レール（sticky）。未指定時は単一カラム */
  rail?: React.ReactNode;
  className?: string;
}

/**
 * PC統一レイアウト: フレーム1120 / ガター32 / 本文1fr+gap28+レール360
 * - lg+: 2カラムグリッド（左=children, 右=rail sticky）
 * - モバイル: rail→children の順で縦積み
 */
export default function PCShell({ active, children, rail, className }: PCShellProps) {
  return (
    <>
      <PCTopNav active={active} />
      <div className={`mx-auto w-full max-w-[1120px] px-4 lg:px-8 ${className ?? ''}`}>
        {rail ? (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-[28px]">
            {/* モバイル: rail を children より先に表示 */}
            <div className="lg:hidden">{rail}</div>
            <div className="min-w-0">{children}</div>
            {/* PC: 右カラム sticky */}
            <div className="hidden lg:block">
              <div className="sticky top-[80px] flex flex-col gap-[14px]">{rail}</div>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </>
  );
}
