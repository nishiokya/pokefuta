'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, Camera, CircleDot, Search } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

function isActivePath(pathname: string, href: string) {
  const hrefPath = href.split('?')[0];
  if (hrefPath === '/') return pathname === '/';
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

export default function BottomNav() {
  const pathname = usePathname();
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

  const guestItems = [
    { href: '/nearby', label: '探す', icon: <Search className="w-6 h-6 mb-1" /> },
    { href: '/visits', label: 'スタンプ帳', icon: <CircleDot className="w-6 h-6 mb-1" /> },
    { href: '/my-trip', label: 'マイ旅', icon: <BookOpen className="w-6 h-6 mb-1" /> },
  ];

  const leftItems = [
    { href: '/nearby', label: '探す', icon: <Search className="w-6 h-6 mb-1" /> },
    { href: '/visits', label: 'スタンプ帳', icon: <CircleDot className="w-6 h-6 mb-1" /> },
  ];

  const rightItems = [
    { href: '/my-trip', label: 'マイ旅', icon: <BookOpen className="w-6 h-6 mb-1" /> },
  ];

  if (!isLoggedIn) {
    return (
      <nav className="nav-rpg lg:hidden">
        <div className="flex justify-around items-center max-w-md mx-auto py-2">
          {guestItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-rpg-item ${isActivePath(pathname, item.href) ? 'active' : ''}`}
              onClick={() => trackNavClick(item.label)}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="nav-rpg lg:hidden">
      <div className="flex items-stretch max-w-md mx-auto" style={{ paddingBottom: 10, paddingTop: 8 }}>
        {/* Left tabs */}
        <div className="flex flex-1 justify-around">
          {leftItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-rpg-item ${isActivePath(pathname, item.href) ? 'active' : ''}`}
              onClick={() => trackNavClick(item.label)}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Center FAB slot */}
        <div style={{ width: 72, flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -22, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <Link
              href="/upload"
              onClick={() => trackNavClick('投稿')}
              style={{
                width: 58,
                height: 58,
                borderRadius: 999,
                border: '3px solid #fff',
                background: 'radial-gradient(120% 120% at 30% 25%, #d06a4f, #bf5640)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 4px 0 #a8462f, 0 10px 22px rgba(191,86,64,.45)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
              aria-label="投稿する"
            >
              <Camera size={26} strokeWidth={2.4} />
            </Link>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#bf5640', fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', lineHeight: 1 }}>投稿</span>
          </div>
        </div>

        {/* Right tabs */}
        <div className="flex flex-1 justify-around">
          {rightItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-rpg-item ${isActivePath(pathname, item.href) ? 'active' : ''}`}
              onClick={() => trackNavClick(item.label)}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
