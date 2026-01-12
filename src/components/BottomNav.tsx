'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Home, MapPin, Navigation, Camera, Menu } from 'lucide-react';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = useMemo(
    () => [
      { href: '/', label: 'ホーム', icon: <Home className="w-6 h-6 mb-1" /> },
      { href: '/map', label: 'マップ', icon: <MapPin className="w-6 h-6 mb-1" /> },
      { href: '/nearby', label: '近く', icon: <Navigation className="w-6 h-6 mb-1" /> },
      { href: '/upload', label: '登録', icon: <Camera className="w-6 h-6 mb-1" /> },
    ],
    []
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
