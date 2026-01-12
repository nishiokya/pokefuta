'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Home, Navigation, Camera, Menu, History, MapPin } from 'lucide-react';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { createBrowserClient } from '@/lib/supabase/client';

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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
    () => [
      { href: '/', label: 'ホーム', icon: <Home className="w-6 h-6 mb-1" /> },
      { href: '/nearby', label: '近く', icon: <Navigation className="w-6 h-6 mb-1" /> },
      { href: '/upload', label: '登録', icon: <Camera className="w-6 h-6 mb-1" /> },
      isLoggedIn
        ? { href: '/visits', label: '履歴', icon: <History className="w-6 h-6 mb-1" /> }
        : { href: '/map', label: 'マップ', icon: <MapPin className="w-6 h-6 mb-1" /> },
    ],
    [isLoggedIn]
  );

  return (
    <>
      <nav className="nav-rpg">
        <div className="flex justify-around items-center max-w-md mx-auto py-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-rpg-item ${isActivePath(pathname, item.href) ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
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
