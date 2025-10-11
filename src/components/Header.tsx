'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Home, Map, Navigation, Camera, History, List } from 'lucide-react';

interface HeaderProps {
  title?: string;
  icon?: React.ReactNode;
}

export default function Header({ title = 'ポケふた', icon }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const menuItems = [
    { href: '/', label: 'ホーム', icon: <Home className="w-5 h-5" /> },
    { href: '/manholes', label: 'マンホール一覧', icon: <List className="w-5 h-5" /> },
    { href: '/nearby', label: '近くの未訪問', icon: <Navigation className="w-5 h-5" /> },
    { href: '/upload', label: '写真を登録', icon: <Camera className="w-5 h-5" /> },
    { href: '/visits', label: '訪問履歴', icon: <History className="w-5 h-5" /> },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <>
      <div className="bg-rpg-bgDark border-b-4 border-rpg-border p-3 sticky top-0 z-40">
        <div className="container-pokemon">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {icon}
              <h1 className="font-pixelJp text-base text-rpg-yellow" style={{
                textShadow: '2px 2px 0 #34495E'
              }}>{title}</h1>
            </div>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="rpg-button p-2"
              aria-label="メニュー"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Overlay */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Menu Panel - RPG Style */}
          <div className="fixed top-16 right-0 w-64 z-50 animate-slide-in">
            <div className="rpg-window m-2">
              <h3 className="rpg-window-title text-sm mb-2">MENU</h3>
              <nav className="space-y-1">
                {menuItems.map((item) => (
                  <div
                    key={item.href}
                    onClick={() => {
                      setIsMenuOpen(false);
                      window.location.href = item.href;
                    }}
                    className={`flex items-center gap-2 px-3 py-2 font-pixelJp text-sm cursor-pointer ${
                      isActive(item.href)
                        ? 'rpg-cursor bg-rpg-yellow text-rpg-textDark border-2 border-rpg-border'
                        : 'text-rpg-textDark hover:bg-rpg-bgLight'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        .animate-slide-in {
          animation: slide-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
