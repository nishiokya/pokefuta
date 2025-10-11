'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Home, Map, Navigation, Camera, History, List, LogOut, User as UserIcon } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface HeaderProps {
  title?: string;
  icon?: React.ReactNode;
}

export default function Header({ title = 'ポケふた', icon }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  let supabase;
  try {
    supabase = createBrowserClient();
  } catch (error: any) {
    console.error('Supabase initialization error:', error);
    setSupabaseError(error.message);
  }

  useEffect(() => {
    // Supabaseクライアントが初期化できなかった場合はスキップ
    if (!supabase || supabaseError) {
      return;
    }

    // ユーザー情報取得
    const getUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('Failed to get user session:', error);
      }
    };

    getUser();

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase, supabaseError]);

  const menuItems = [
    { href: '/', label: 'ホーム', icon: <Home className="w-5 h-5" /> },
    { href: '/manholes', label: 'マンホール一覧', icon: <List className="w-5 h-5" /> },
    { href: '/nearby', label: '近くの未訪問', icon: <Navigation className="w-5 h-5" /> },
    { href: '/upload', label: '写真を登録', icon: <Camera className="w-5 h-5" /> },
    { href: '/visits', label: '訪問履歴', icon: <History className="w-5 h-5" /> },
  ];

  const isActive = (href: string) => pathname === href;

  const handleLogout = async () => {
    if (!supabase) return;

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await supabase.auth.signOut();
      setIsMenuOpen(false);
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

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

              {/* User Info */}
              {user ? (
                <div className="mb-3 pb-3 border-b-2 border-rpg-border">
                  <div className="flex items-center gap-2 px-3 py-2 bg-rpg-bgLight">
                    <div className="w-8 h-8 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-rpg-textDark" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-pixelJp text-xs text-rpg-textDark font-bold truncate">
                        {user.user_metadata?.display_name || user.email?.split('@')[0] || 'トレーナー'}
                      </p>
                      <p className="font-pixelJp text-xs text-rpg-textDark opacity-50 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-3 pb-3 border-b-2 border-rpg-border">
                  <div
                    onClick={() => {
                      setIsMenuOpen(false);
                      window.location.href = '/login';
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-rpg-yellow cursor-pointer hover:opacity-80"
                  >
                    <UserIcon className="w-4 h-4 text-rpg-textDark" />
                    <span className="font-pixelJp text-sm text-rpg-textDark font-bold">ログイン</span>
                  </div>
                </div>
              )}

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

                {/* Logout Button */}
                {user && (
                  <div
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-2 font-pixelJp text-sm cursor-pointer text-rpg-red hover:bg-rpg-red/10 border-t-2 border-rpg-border mt-2 pt-2"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>ログアウト</span>
                  </div>
                )}
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
