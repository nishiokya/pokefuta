'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CircleDot, Home, Menu, Search, TrendingUp } from 'lucide-react';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

function isActivePath(pathname: string, href: string) {
  const hrefPath = href.split('?')[0];
  if (hrefPath === '/') return pathname === '/';
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

export default function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { trackNavClick } = useAnalytics();

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        setIsLoggedIn(Boolean(session?.user));
      } catch {
        if (cancelled) return;
        setIsLoggedIn(false);
      }
    };

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => isLoggedIn
      ? [
          { href: '/nearby', label: '探す', icon: <Search className="w-6 h-6 mb-1" /> },
          { href: '/visits', label: 'スタンプ帳', icon: <CircleDot className="w-6 h-6 mb-1" /> },
          { href: '/', label: 'マイ旅', icon: <Home className="w-6 h-6 mb-1" /> },
        ]
      : [
          { href: '/nearby', label: '探す', icon: <Search className="w-6 h-6 mb-1" /> },
          { href: '/popular', label: '人気', icon: <TrendingUp className="w-6 h-6 mb-1" /> },
          { href: '/visits', label: 'スタンプ帳', icon: <CircleDot className="w-6 h-6 mb-1" /> },
        ],
    [isLoggedIn]
  );

  return (
    <>
      <nav className="nav-rpg">
        <div className="flex justify-around items-center max-w-md mx-auto py-2">
          {items.map((item) => {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-rpg-item ${isActivePath(pathname, item.href) ? 'active' : ''}`}
                onClick={() => trackNavClick(item.label)}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => {
              // ✅ GA: メニューボタンクリック追跡
              trackNavClick('メニュー');
              setMenuOpen(true);
            }}
            className="nav-rpg-item"
            aria-label="メニュー"
          >
            <Menu className="w-6 h-6 mb-1" />
            <span>メニュー</span>
          </button>
        </div>
      </nav>

      <MobileMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
