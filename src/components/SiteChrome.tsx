'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BookOpen, Camera, CircleDot, Info, Search, User as UserIcon, UserPlus } from 'lucide-react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { AUTH_NAV_ITEMS, GUEST_NAV_ITEMS, NavKey, resolveChrome } from '@/lib/siteNav';

/**
 * サイト共通クロム（SPヘッダー／PCトップナビ／SP下タブ）。
 *
 * `layout.tsx` が全ページを包むので、ページ側にヘッダーの記述は一切要らない。
 * ページ固有のタイトルは `@/lib/siteNav` のルート表で持ち、動的なものだけ
 * `useHeaderTitle()` で上書きする。
 *
 * 認証セッションの読み込みはここ1箇所。以前は Header / PCTopNav / BottomNav が
 * それぞれ getSession() していて1ページで3回叩いていた。
 */

const DATA_SITE_URL = 'https://data.pokefuta.com/';
const X_ACCOUNT_URL = 'https://x.com/pokemonmanhole';
const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

// ─────────────────────────────────────────────
// 動的タイトル
// ─────────────────────────────────────────────

const TitleOverrideContext = createContext<((title: string | null) => void) | null>(null);

/**
 * ルート表で決まらないタイトル（`${市町村}のポケふた` など）を上書きする。
 * `undefined` を渡すとルート表の既定に戻る。
 */
export function useHeaderTitle(title: string | undefined) {
  const setOverride = useContext(TitleOverrideContext);

  useEffect(() => {
    if (!setOverride) return;
    setOverride(title ?? null);
    return () => setOverride(null);
  }, [setOverride, title]);
}

// ─────────────────────────────────────────────
// パーツ
// ─────────────────────────────────────────────

function PokeballMark({ size = 28 }: { size?: number }) {
  const core = size * 0.38;
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
        border: '2px solid var(--chrome-ink)',
        background: '#fff',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '50%', background: 'var(--chrome-ball-red)' }} />
      <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'var(--chrome-ink)', transform: 'translateY(-50%)' }} />
      <span style={{ position: 'relative', zIndex: 1, width: core, height: core, borderRadius: '50%', border: '2px solid var(--chrome-ink)', background: '#fff' }} />
    </span>
  );
}

function isActivePath(pathname: string, href: string) {
  const path = href.split('?')[0];
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

const displayNameOf = (user: User) =>
  user.user_metadata?.display_name || user.email?.split('@')[0] || 'トレーナー';

type ChromeState = {
  user: User | null;
  authLoaded: boolean;
  activeNav?: NavKey;
  pathname: string;
};

// ─────────────────────────────────────────────
// SP ヘッダー（<1024px）
// ─────────────────────────────────────────────

/**
 * 要素は「ロゴ / ページタイトル / 認証」の3つだけ。
 * Info・X・図鑑・デザイン蓋をヘッダーに並べていた頃はタップ領域が潰れていたので、
 * ナビは下タブ、ユーティリティはフッターへ分けている。
 */
function SpHeader({ title, user, authLoaded }: ChromeState & { title: string }) {
  return (
    <header
      // z-50 / 下タブの z-40 は --chrome-z-header / --chrome-z-bottomnav と対応。
      // Tailwind 側を変えるときはトークンも合わせること。
      className="sticky top-0 z-50 lg:hidden"
      style={{
        background: 'var(--chrome-sp-bg)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--chrome-sp-border)',
        color: 'var(--chrome-ink)',
        // ヘッダーは本文の外側にあるので、上の safe-area はここが持つ。
        // 本文側は .safe-area-body（左右のみ）で、二重適用にならないようにしている
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div
        className="mx-auto flex max-w-6xl items-center gap-2 px-3"
        style={{ minHeight: 'calc(var(--chrome-height) - 1px)' }}
      >
        <Link
          href="/"
          aria-label="ホームに戻る"
          className="flex flex-shrink-0 items-center justify-center"
          style={{ minWidth: 'var(--chrome-tap-min)', minHeight: 'var(--chrome-tap-min)' }}
        >
          <PokeballMark size={30} />
        </Link>

        <span className="min-w-0 flex-1 truncate text-base font-bold" style={{ fontFamily: ROUND }}>
          {title}
        </span>

        {authLoaded &&
          (user ? (
            // 名前クリック → /profile（プロフィール編集・ログアウトの唯一の場所）
            <Link
              href="/profile"
              aria-label="プロフィール"
              className="flex max-w-[7.5rem] flex-shrink-0 items-center gap-1.5 truncate rounded-lg border px-2.5 text-xs font-bold"
              style={{
                minHeight: 'var(--chrome-tap-min)',
                borderColor: 'var(--chrome-accent-border)',
                background: 'rgba(255,255,255,.7)',
                color: 'var(--chrome-ink)',
              }}
            >
              <UserIcon className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--chrome-accent)' }} />
              <span className="truncate">{displayNameOf(user)}</span>
            </Link>
          ) : (
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <Link
                href="/login"
                className="flex items-center rounded-lg border px-3 text-xs font-bold"
                style={{
                  minHeight: 'var(--chrome-tap-min)',
                  borderColor: 'var(--chrome-accent)',
                  color: 'var(--chrome-accent)',
                }}
              >
                ログイン
              </Link>
              <Link
                href="/login"
                aria-label="新規登録"
                className="flex items-center justify-center rounded-full text-white shadow-sm"
                style={{
                  minWidth: 'var(--chrome-tap-min)',
                  minHeight: 'var(--chrome-tap-min)',
                  background: 'var(--chrome-accent)',
                }}
              >
                <UserPlus className="h-4 w-4" />
              </Link>
            </div>
          ))}
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// PC トップナビ（≥1024px）
// ─────────────────────────────────────────────

const pcIconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 'var(--chrome-radius-pill)',
  color: 'var(--chrome-pc-nav)',
  flexShrink: 0,
  textDecoration: 'none',
};

function pcNavLinkStyle(isActive: boolean): React.CSSProperties {
  return {
    fontSize: 13.5,
    fontWeight: 600,
    color: isActive ? 'var(--chrome-pc-nav-active)' : 'var(--chrome-pc-nav)',
    padding: '7px 13px',
    borderRadius: 'var(--chrome-radius-nav)',
    background: isActive ? 'var(--chrome-pc-nav-active-bg)' : 'transparent',
    textDecoration: 'none',
  };
}

function PcTopNav({ user, authLoaded, activeNav, pathname }: ChromeState) {
  const { trackXLinkClick } = useAnalytics();
  const isLoggedIn = authLoaded && user !== null;
  const navItems = isLoggedIn ? AUTH_NAV_ITEMS : GUEST_NAV_ITEMS;
  const isUploading = isActivePath(pathname, '/upload');

  return (
    <nav
      className="hidden lg:flex"
      aria-label="メインナビゲーション"
      style={{
        alignItems: 'center',
        gap: 14,
        minHeight: 'var(--chrome-height)',
        padding: '0 32px',
        background: 'var(--chrome-pc-bg)',
        borderBottom: '1px solid var(--chrome-pc-border)',
      }}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2" style={{ textDecoration: 'none' }}>
        <PokeballMark size={28} />
        <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--chrome-ink-pc)', fontFamily: ROUND }}>
          {/* TODO(ステップ6): ここを `ポケふた ｜ 写真館 ▾` のサイトスイッチャーにする */}
          ポケふた写真館
        </span>
      </Link>

      {/*
        ナビ項目は認証の解決を待たずに出す。
        待つとセッション取得が遅い/失敗したときに nav が空のままになり、
        今回直した「PC なのにナビが無い」状態に逆戻りするため。
        ログイン後に増えるのは「マイ旅」だけなので、項目が消えるちらつきは起きない。
      */}
      <div style={{ display: 'flex', gap: 4, marginLeft: 18 }}>
        {navItems.map(({ key, label, href }) => (
          <Link key={key} href={href} style={pcNavLinkStyle(activeNav ? activeNav === key : isActivePath(pathname, href))}>
            {label}
          </Link>
        ))}
        {/* 図鑑は外部サイト。内部 Link 前提の NAV_ITEMS には混ぜない */}
        <a href={DATA_SITE_URL} style={pcNavLinkStyle(false)}>
          図鑑
        </a>
        <Link href="/design-manholes" style={pcNavLinkStyle(activeNav === 'design')}>
          デザイン蓋
        </Link>
      </div>

      <div style={{ flex: 1 }} />

      <Link href="/about" style={pcIconBtn} title="このアプリについて" aria-label="このアプリについて">
        <Info size={18} strokeWidth={2} />
      </Link>

      <a
        href={X_ACCOUNT_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...pcIconBtn, fontSize: 15, fontWeight: 900 }}
        title="公式X @pokemonmanhole"
        aria-label="公式X @pokemonmanhole"
        onClick={() => trackXLinkClick({ surface: 'header', source_app: 'tracker', is_logged_in: isLoggedIn })}
      >
        X
      </a>

      {isLoggedIn && (
        <Link
          href="/upload"
          aria-current={isUploading ? 'page' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--chrome-cta)',
            color: '#fff',
            borderRadius: 'var(--chrome-radius-pill)',
            padding: '9px 18px 9px 15px',
            fontFamily: ROUND,
            fontWeight: 800,
            fontSize: 14,
            textDecoration: 'none',
            boxShadow: '0 2px 0 var(--chrome-cta-shadow), 0 7px 18px rgba(191,86,64,.38), 0 0 0 3px rgba(191,86,64,.13)',
            flexShrink: 0,
            opacity: isUploading ? 0.7 : 1,
          }}
        >
          <Camera size={17} strokeWidth={2.5} />
          投稿する
        </Link>
      )}

      {authLoaded &&
        (user ? (
          <Link
            href="/profile"
            title="プロフィール"
            aria-label="プロフィール"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--chrome-pc-nav)',
              padding: '4px 10px 4px 4px',
              borderRadius: 'var(--chrome-radius-pill)',
              textDecoration: 'none',
              flexShrink: 0,
              background: pathname === '/profile' ? 'var(--chrome-pc-nav-active-bg)' : 'transparent',
            }}
          >
            <span style={{ width: 26, height: 26, borderRadius: 999, background: '#dfe7f3', display: 'grid', placeItems: 'center', fontSize: 13, flexShrink: 0 }}>
              👤
            </span>
            {displayNameOf(user)}
          </Link>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Link
              href="/login"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--chrome-accent)',
                padding: '6px 14px',
                borderRadius: 'var(--chrome-radius-pill)',
                border: '1px solid var(--chrome-accent-border)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              ログイン
            </Link>
            <Link
              href="/login"
              aria-label="新規登録"
              className="flex items-center gap-1.5"
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#fff',
                background: 'var(--chrome-accent)',
                padding: '6px 14px',
                borderRadius: 'var(--chrome-radius-pill)',
                boxShadow: '0 2px 0 #5f55b8',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              <UserPlus size={15} strokeWidth={2.2} />
              新規登録
            </Link>
          </span>
        ))}
    </nav>
  );
}

// ─────────────────────────────────────────────
// SP ユーティリティフッター（<1024px）
// ─────────────────────────────────────────────

/**
 * SP ヘッダーから外した導線の受け皿。下タブの上、本文の末尾に置く。
 *
 * 「図鑑」「デザイン蓋」は下タブに入れる枠が無い（4枠は 探す/スタンプ帳/マイ旅＋投稿FAB で
 * 埋まっている）が、SP から到達できなくなると PC にしかない導線になってしまうので、
 * Info・X と同じくここで必ず出す。**この2つを消さないこと。**
 */
const footerLinkStyle: React.CSSProperties = {
  color: 'var(--chrome-pc-nav)',
  minHeight: 'var(--chrome-tap-min)',
};

function SpUtilityFooter({ user, authLoaded }: ChromeState) {
  const { trackXLinkClick } = useAnalytics();

  // pb-nav-safe はフッター自身に付ける。
  // ページ側の pb-nav-safe は children の内側にあるのでフッターを保護できず、
  // これが無いと固定下タブがフッターに重なって X リンクが完全に隠れる。
  return (
    <footer className="pb-nav-safe lg:hidden lg:pb-0" style={{ borderTop: '1px solid var(--chrome-sp-border)' }}>
      <nav
        aria-label="サイト内リンク"
        className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-1 pt-3 text-xs font-bold"
      >
        <a href={DATA_SITE_URL} className="inline-flex items-center px-2" style={footerLinkStyle}>
          図鑑
        </a>
        <Link href="/design-manholes" className="inline-flex items-center px-2" style={footerLinkStyle}>
          デザイン蓋
        </Link>
        <Link href="/about" className="inline-flex items-center gap-1.5 px-2" style={footerLinkStyle}>
          <Info className="h-4 w-4" />
          このアプリについて
        </Link>
        <a
          href={X_ACCOUNT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2"
          style={footerLinkStyle}
          onClick={() => trackXLinkClick({ surface: 'footer', source_app: 'tracker', is_logged_in: authLoaded && user !== null })}
        >
          <span className="font-sans text-base font-black">X</span>
          @pokemonmanhole
        </a>
      </nav>
    </footer>
  );
}

// ─────────────────────────────────────────────
// SP 下タブ（<1024px）
// ─────────────────────────────────────────────

const BOTTOM_TAB_ICONS: Record<string, React.ReactNode> = {
  search: <Search className="mb-1 h-6 w-6" />,
  stamp: <CircleDot className="mb-1 h-6 w-6" />,
  mytrip: <BookOpen className="mb-1 h-6 w-6" />,
};

function BottomNav({ user, authLoaded, activeNav, pathname }: ChromeState) {
  const { trackNavClick } = useAnalytics();
  const isLoggedIn = authLoaded && user !== null;

  const tab = ({ key, label, href }: { key: NavKey; label: string; href: string }) => (
    <Link
      key={key}
      href={href}
      className={`nav-rpg-item ${activeNav ? (activeNav === key ? 'active' : '') : isActivePath(pathname, href) ? 'active' : ''}`}
      onClick={() => trackNavClick(label)}
    >
      {BOTTOM_TAB_ICONS[key]}
      <span>{label}</span>
    </Link>
  );

  // 未ログインは投稿 FAB を出さないので、3タブを均等割りするだけ
  if (!isLoggedIn) {
    return (
      <nav className="nav-rpg lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around py-2">
          {AUTH_NAV_ITEMS.map(tab)}
        </div>
      </nav>
    );
  }

  return (
    <nav className="nav-rpg lg:hidden">
      <div className="mx-auto flex max-w-md items-stretch" style={{ paddingBottom: 10, paddingTop: 8 }}>
        <div className="flex flex-1 justify-around">{AUTH_NAV_ITEMS.slice(0, 2).map(tab)}</div>

        {/* 中央の投稿 FAB */}
        <div style={{ width: 72, flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -22, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Link
              href="/upload"
              onClick={() => trackNavClick('投稿')}
              aria-current={isActivePath(pathname, '/upload') ? 'page' : undefined}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none' }}
            >
              <span
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 999,
                  border: '3px solid #fff',
                  background: 'radial-gradient(120% 120% at 30% 25%, #d06a4f, var(--chrome-cta))',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 4px 0 var(--chrome-cta-shadow), 0 10px 22px rgba(191,86,64,.45)',
                  flexShrink: 0,
                }}
              >
                <Camera size={26} strokeWidth={2.4} />
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--chrome-cta)', fontFamily: ROUND, lineHeight: 1 }}>投稿</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-1 justify-around">{AUTH_NAV_ITEMS.slice(2).map(tab)}</div>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────
// 本体
// ─────────────────────────────────────────────

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const route = resolveChrome(pathname);

  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  useEffect(() => {
    let supabase: SupabaseClient;
    try {
      supabase = createBrowserClient();
    } catch (error) {
      console.error('Supabase initialization error:', error);
      setAuthLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) setUser(session?.user ?? null);
      } catch (error) {
        console.error('Failed to get user session:', error);
      } finally {
        if (!cancelled) setAuthLoaded(true);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoaded(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const state: ChromeState = { user, authLoaded, activeNav: route.activeNav, pathname };
  const title = titleOverride ?? route.title;

  // setState を直接渡すと参照が毎回変わり、useHeaderTitle の effect が回り続ける
  const setOverride = useMemo(() => (value: string | null) => setTitleOverride(value), []);

  return (
    <TitleOverrideContext.Provider value={setOverride}>
      {route.bare ? (
        children
      ) : (
        <>
          <SpHeader {...state} title={title} />
          <PcTopNav {...state} />
          {children}
          <SpUtilityFooter {...state} />
          <BottomNav {...state} />
        </>
      )}
    </TitleOverrideContext.Provider>
  );
}
