'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  List,
  MapPin,
  Navigation,
  Camera,
  History,
  Info,
  LogOut,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function MobileMenuDrawer({ open, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    try {
      const client = createBrowserClient();
      setSupabase(client);
      setSupabaseError(null);
    } catch (error: any) {
      console.error('Supabase initialization error:', error);
      setSupabase(null);
      setSupabaseError(error?.message ?? 'Supabase initialization error');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!supabase || supabaseError) return;

    const getUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('Failed to get user session:', error);
      }
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [open, supabase, supabaseError]);

  const isActive = (href: string) => pathname === href;

  const menuItems: Array<{
    href: string;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    { href: '/', label: 'ホーム', description: '最近の投稿や入口', icon: <Home className="w-5 h-5" /> },
    {
      href: '/manholes',
      label: 'マンホール一覧',
      description: 'ポケふたを検索/一覧で見る',
      icon: <List className="w-5 h-5" />,
    },
    {
      href: '/nearby',
      label: '近くの未訪問',
      description: '今いる場所の近くを探す',
      icon: <Navigation className="w-5 h-5" />,
    },
    {
      href: '/map',
      label: 'マップ',
      description: '地図で全体を見る（必要なら）',
      icon: <MapPin className="w-5 h-5" />,
    },
    { href: '/upload', label: '写真を登録', description: '訪問写真を追加する', icon: <Camera className="w-5 h-5" /> },
    { href: '/visits', label: '訪問履歴', description: '自分の訪問記録を見る', icon: <History className="w-5 h-5" /> },
    { href: '/about', label: 'このアプリについて', description: '使い方/注意事項', icon: <Info className="w-5 h-5" /> },
  ];

  const handleLogout = async () => {
    if (!supabase) return;

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await supabase.auth.signOut();
      onClose();
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-72 z-[60] animate-slide-in">
        <div className="rpg-window m-2 h-[calc(100vh-1rem)] overflow-auto safe-area-inset">
          <div className="flex items-center justify-between mb-2">
            <h3 className="rpg-window-title text-sm">MENU</h3>
            <button onClick={onClose} className="rpg-button p-2" aria-label="閉じる">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Info */}
          {user ? (
            <div className="mb-3 pb-3 border-b-2 border-rpg-border">
              <div className="flex items-center gap-2 px-3 py-2 bg-rpg-bgLight">
                <div className="w-8 h-8 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-rpg-textDark" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-pixelJp text-xs text-rpg-textDark font-bold truncate">
                    {user.user_metadata?.display_name ||
                      user.email?.split('@')[0] ||
                      'トレーナー'}
                  </p>
                  <p className="font-pixelJp text-xs text-rpg-textDark opacity-50 truncate">
                    {user.email}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-3 pb-3 border-b-2 border-rpg-border">
              <div className="space-y-2">
                <div
                  onClick={() => {
                    onClose();
                    window.location.href = '/signup';
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-rpg-blue cursor-pointer hover:opacity-80"
                >
                  <UserIcon className="w-4 h-4 text-white" />
                  <span className="font-pixelJp text-sm text-white font-bold">新規登録</span>
                </div>

                <div
                  onClick={() => {
                    onClose();
                    window.location.href = '/login?redirect=/upload';
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-rpg-yellow cursor-pointer hover:opacity-80"
                >
                  <UserIcon className="w-4 h-4 text-rpg-textDark" />
                  <span className="font-pixelJp text-sm text-rpg-textDark font-bold">ログイン</span>
                </div>
              </div>
            </div>
          )}

          <nav className="space-y-1">
            {menuItems.map((item) => (
              <div
                key={item.href}
                onClick={() => {
                  onClose();
                  window.location.href = item.href;
                }}
                className={`flex items-start gap-2 px-3 py-2 font-pixelJp cursor-pointer ${
                  isActive(item.href)
                    ? 'rpg-cursor bg-rpg-yellow text-rpg-textDark border-2 border-rpg-border'
                    : 'text-rpg-textDark hover:bg-rpg-bgLight'
                }`}
              >
                <div className="mt-0.5">{item.icon}</div>
                <div className="min-w-0">
                  <div className="text-sm leading-5">{item.label}</div>
                  <div className="text-xs opacity-70 leading-4">{item.description}</div>
                </div>
              </div>
            ))}

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

          {supabaseError && (
            <div className="mt-3 p-2 bg-rpg-red/20 border-2 border-rpg-red">
              <p className="font-pixelJp text-xs text-rpg-red font-bold mb-1">❌ エラー</p>
              <p className="font-pixelJp text-xs text-rpg-textDark">{supabaseError}</p>
            </div>
          )}
        </div>
      </div>

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
