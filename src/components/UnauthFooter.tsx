'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LogIn, UserPlus } from 'lucide-react';

function isActivePath(pathname: string, href: string) {
  const hrefPath = href.split('?')[0];
  if (hrefPath === '/') return pathname === '/';
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

export default function UnauthFooter() {
  const pathname = usePathname();

  const items = [
    { href: '/', label: 'ホーム', icon: <Home className="w-6 h-6 mb-1" /> },
    { href: '/login?redirect=/upload', label: 'ログイン', icon: <LogIn className="w-6 h-6 mb-1" /> },
    { href: '/signup', label: 'アカウント作成', icon: <UserPlus className="w-6 h-6 mb-1" /> },
  ];

  return (
    <nav className="nav-rpg" aria-label="未ログインフッター">
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
      </div>
    </nav>
  );
}
