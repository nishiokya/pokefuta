'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Camera, Info, LogOut, UserPlus } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';

type NavTab = 'search' | 'stamp' | 'mytrip';

const GUEST_NAV_ITEMS: { key: NavTab; label: string; href: string }[] = [
  { key: 'search', label: '探す', href: '/nearby' },
  { key: 'stamp', label: 'スタンプ帳', href: '/visits' },
];

const AUTH_NAV_ITEMS: { key: NavTab; label: string; href: string }[] = [
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

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 999,
  border: 'none',
  background: 'transparent',
  color: '#6f6657',
  cursor: 'pointer',
  flexShrink: 0,
  textDecoration: 'none',
};

interface PCTopNavProps {
  active?: NavTab;
}

function PCTopNav({ active }: PCTopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
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

  const handleLogout = async () => {
    try {
      const supabase = createBrowserClient();
      await fetch('/api/auth/logout', { method: 'POST' });
      await supabase.auth.signOut();
      setDisplayName(null);
      router.push('/');
      router.refresh();
    } catch { /* ignore */ }
  };

  const isLoggedIn = authLoaded && displayName !== null;
  const navItems = isLoggedIn ? AUTH_NAV_ITEMS : GUEST_NAV_ITEMS;

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
        <span style={{ fontWeight: 700, fontSize: 18, color: '#38414f', fontFamily: ROUND }}>ポケふた写真館</span>
      </Link>

      {/* ナビリンク */}
      <div style={{ display: 'flex', gap: 4, marginLeft: 18 }}>
        {authLoaded && navItems.map(({ key, label, href }) => {
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
        {/* 図鑑（data.pokefuta.com）への外部リンク。内部Link前提の GUEST/AUTH_NAV_ITEMS には混ぜない */}
        {authLoaded && (
          <a
            href="https://data.pokefuta.com/"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: '#6f6657',
              padding: '7px 13px',
              borderRadius: 9,
              textDecoration: 'none',
            }}
          >
            図鑑
          </a>
        )}
        {authLoaded && (
          <Link
            href="/design-manholes"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: pathname === '/design-manholes' || pathname.startsWith('/design-manholes/') ? '#2c2a26' : '#6f6657',
              padding: '7px 13px',
              borderRadius: 9,
              background: pathname === '/design-manholes' || pathname.startsWith('/design-manholes/') ? '#e9dfc7' : 'transparent',
              textDecoration: 'none',
            }}
          >
            デザイン蓋
          </Link>
        )}
      </div>

      {/* スペーサー */}
      <div style={{ flex: 1 }} />

      {/* Info */}
      <Link href="/about" style={iconBtn} title="このアプリについて" aria-label="このアプリについて">
        <Info size={18} strokeWidth={2} />
      </Link>

      {/* X */}
      <a
        href="https://x.com/pokemonmanhole"
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...iconBtn, fontSize: 15, fontWeight: 900 }}
        title="公式X @pokemonmanhole"
        aria-label="公式X @pokemonmanhole"
      >
        X
      </a>

      {/* 投稿する */}
      {isLoggedIn && (
        <Link
          href="/upload"
          aria-current={pathname === '/upload' || pathname.startsWith('/upload/') ? 'page' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#bf5640',
            color: '#fff',
            borderRadius: 999,
            padding: '9px 18px 9px 15px',
            fontFamily: ROUND,
            fontWeight: 800,
            fontSize: 14,
            textDecoration: 'none',
            boxShadow: '0 2px 0 #a8462f, 0 7px 18px rgba(191,86,64,.38), 0 0 0 3px rgba(191,86,64,.13)',
            flexShrink: 0,
            opacity: pathname === '/upload' || pathname.startsWith('/upload/') ? 0.7 : 1,
          }}
        >
          <Camera size={17} strokeWidth={2.5} />投稿する
        </Link>
      )}

      {/* ユーザー */}
      {authLoaded && (
        displayName ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#6f6657' }}>
              <span style={{ width: 26, height: 26, borderRadius: 999, background: '#dfe7f3', display: 'grid', placeItems: 'center', fontSize: 13, flexShrink: 0 }}>
                👤
              </span>
              {displayName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              style={iconBtn}
              title="ログアウト"
              aria-label="ログアウト"
            >
              <LogOut size={16} strokeWidth={2} />
            </button>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Link
              href="/login"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#7B63A8',
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid #d7d0ef',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              ログイン
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-1.5"
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#fff',
                background: '#7B63A8',
                padding: '6px 14px',
                borderRadius: 999,
                boxShadow: '0 2px 0 #5f55b8',
                textDecoration: 'none',
                flexShrink: 0,
              }}
              aria-label="新規登録"
            >
              <UserPlus size={15} strokeWidth={2.2} />
              新規登録
            </Link>
          </span>
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
            {/* PC: 右カラム sticky */}
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
