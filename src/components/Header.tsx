'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Info, LogOut, User as UserIcon, UserPlus } from 'lucide-react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type HeaderProps = {
  title?: string;
  actions?: ReactNode;
  showDescriptionLink?: boolean;
  showXLink?: boolean;
};

const getDisplayName = (user: User | null) =>
  user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'トレーナー';

function PokeballMark() {
  return (
    <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#2A2A2A] bg-white shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-[#E85046]" />
      <span className="absolute inset-x-0 top-1/2 h-[2px] bg-[#2A2A2A]" />
      <span className="relative h-3 w-3 rounded-full border-2 border-[#2A2A2A] bg-white" />
    </span>
  );
}

export default function Header({
  title = 'ポケふた写真館',
  actions,
  showDescriptionLink = true,
  showXLink = true,
}: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const { trackLogout, clearUser, trackXLinkClick } = useAnalytics();

  useEffect(() => {
    try {
      setSupabase(createBrowserClient());
    } catch (error) {
      console.error('Supabase initialization error:', error);
      setSupabase(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    const loadSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) setUser(session?.user ?? null);
      } catch (error) {
        console.error('Failed to get user session:', error);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    if (!supabase) return;

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await supabase.auth.signOut();
      trackLogout();
      clearUser();
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#7B63A8]/20 bg-[#FFF8EB]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-bold" aria-label="ホームに戻る">
          <PokeballMark />
          <span className="truncate text-base tracking-normal sm:text-lg">{title}</span>
        </Link>

        {actions && (
          <div className="order-3 flex w-full items-center justify-end gap-2 sm:order-2 sm:w-auto">
            {actions}
          </div>
        )}

        <div className="order-2 flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:order-3 sm:gap-2">
          {showDescriptionLink && (
            <Link
              href="/about"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="このアプリについて"
              title="このアプリについて"
            >
              <Info className="h-5 w-5" />
            </Link>
          )}

          {showXLink && (
            <a
              href="https://x.com/pokemonmanhole"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-sans text-lg font-black text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="公式X @pokemonmanhole"
              title="公式X @pokemonmanhole"
              onClick={() =>
                trackXLinkClick({
                  location: 'header',
                  source_app: 'tracker',
                  is_logged_in: Boolean(user),
                })
              }
            >
              X
            </a>
          )}

          {user ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="flex max-w-[7rem] items-center gap-1 truncate rounded-lg border border-[#7B63A8]/15 bg-white/70 px-2 py-1.5 text-xs font-bold text-[#2A2A2A] sm:max-w-[9rem] sm:gap-1.5 sm:px-2.5 sm:py-2">
                <UserIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#7B63A8] sm:h-4 sm:w-4" />
                <span className="truncate">{getDisplayName(user)}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#B5483C] transition hover:bg-[#B5483C]/10 sm:w-auto sm:gap-2 sm:rounded-lg sm:px-3 sm:text-sm sm:font-bold"
                aria-label="ログアウト"
                title="ログアウト"
              >
                <LogOut className="h-5 w-5" />
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
              <Link
                href="/login"
                className="rounded-lg border border-[#7B63A8] px-3 py-2 text-xs font-bold text-[#7B63A8] transition hover:bg-[#7B63A8]/10 sm:px-4 sm:text-sm"
              >
                ログイン
              </Link>
              <Link
                href="/login"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7B63A8] text-white shadow-sm transition hover:bg-[#6A5299] sm:w-auto sm:gap-2 sm:rounded-lg sm:px-4 sm:text-sm sm:font-bold"
                aria-label="新規登録"
              >
                <UserPlus className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">新規登録</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
