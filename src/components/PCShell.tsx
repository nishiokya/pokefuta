'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

type NavTab = 'search' | 'stamp' | 'mytrip';

const NAV_ITEMS: { key: NavTab; label: string; href: string }[] = [
  { key: 'search', label: '探す', href: '/nearby' },
  { key: 'stamp', label: 'スタンプ帳', href: '/visits' },
  { key: 'mytrip', label: 'マイ旅', href: '/my-trip' },
];

const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

function PokeballMark({ size = 28 }: { size?: number }) {
  const center = size * 0.38;
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid #2A2A2A',
        background: '#fff',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '50%', background: '#E85046' }} />
      <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#2A2A2A', transform: 'translateY(-50%)' }} />
      <span style={{ position: 'relative', width: center, height: center, borderRadius: '50%', border: '2px solid #2A2A2A', background: '#fff', zIndex: 1 }} />
    </span>
  );
}

interface PCTopNavProps {
  active?: NavTab;
}

function PCTopNav({ active }: PCTopNavProps) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) {
          if (session?.user) {
            setDisplayName(
              session.user.user_metadata?.display_name ||
              session.user.email?.split('@')[0] ||
              'トレーナー'
            );
          }
          setAuthLoaded(true);
        }
      } catch {
        if (!cancelled) setAuthLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resolveActive = (key: NavTab, href: string) => {
    if (active) return active === key;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      className="hidden lg:flex"
      style={{
        alignItems: 'center',
        gap: 14,
        padding: '14px 32px',
        background: '#f4ecda',
        borderBottom: '1px solid #e9dfc7',
      }}
    >
      {/* ロゴ */}
      <Link href="/" className="flex items-center gap-2 shrink-0" style={{ textDecoration: 'none' }}>
        <PokeballMark size={28} />
        <span style={{ fontWeight: 700, fontSize: 18, color: '#38414f', fontFamily: ROUND }}>ポケふた</span>
      </Link>

      {/* ナビリンク */}
      <div style={{ display: 'flex', gap: 4, marginLeft: 18 }}>
        {NAV_ITEMS.map(({ key, label, href }) => {
          const isActive = resolveActive(key, href);
          return (
            <Link
              key={key}
              href={href}
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: isActive ? '#2c2a26' : '#6f6657',
                padding: '7px 13px',
                borderRadius: 9,
                background: isActive ? '#e9dfc7' : 'transparent',
                textDecoration: 'none',
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* スペーサー */}
      <div style={{ flex: 1 }} />

      {/* ユーザー */}
      {authLoaded && (
        displayName ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#6f6657', flexShrink: 0 }}>
            <span style={{ width: 26, height: 26, borderRadius: 999, background: '#dfe7f3', display: 'grid', placeItems: 'center', fontSize: 13, flexShrink: 0 }}>
              👤
            </span>
            {displayName}
          </span>
        ) : (
          <Link
            href="/login"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#bf5640',
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid #bf5640',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            ログイン
          </Link>
        )
      )}
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
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-[28px]">
            {/* モバイル: rail を children より先に表示 */}
            <div className="lg:hidden">{rail}</div>
            <div className="min-w-0">{children}</div>
            {/* PC: 右カラム sticky — items-start を外して右列が左列と同高さになるよう stretch させる */}
            <div className="hidden lg:block">
              <div className="sticky top-[20px] flex flex-col gap-[14px]">{rail}</div>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </>
  );
}
