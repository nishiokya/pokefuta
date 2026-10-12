'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, Camera, CircleDot, Info, Search, User as UserIcon, UserPlus } from 'lucide-react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { AUTH_NAV_ITEMS, GUEST_NAV_ITEMS, isSubmissionPage, NavKey, resolveChrome } from '@/lib/siteNav';

/**
 * サイト共通クロム（SPヘッダー／PCトップナビ／SP下タブ）。
 *
 * `layout.tsx` が全ページを包むので、ページ側にヘッダーの記述は一切要らない。
 * SP ヘッダーの文字は図鑑と同じく「ポケふた｜写真館」で固定する（ページ名は出さない）。
 * ページごとの差分（アクティブタブなど）は `@/lib/siteNav` のルート表で持つ。
 *
 * 認証セッションの読み込みはここ1箇所。以前は Header / PCTopNav / BottomNav が
 * それぞれ getSession() していて1ページで3回叩いていた。
 */

const DATA_SITE_URL = 'https://data.pokefuta.com/';
const X_ACCOUNT_URL = 'https://x.com/pokemonmanhole';
const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

// ─────────────────────────────────────────────
// パーツ
// ─────────────────────────────────────────────

function BrandMark({ size = 30 }: { size?: number | string }) {
  return (
    // Header-only mark (favicons use the separate navy lid in brand-icon.svg); decorative beside the site label.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand-mark.svg"
      width={30}
      height={30}
      alt=""
      aria-hidden="true"
      style={{ flexShrink: 0, width: size, height: size }}
    />
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
// サイトスイッチャー（写真館 ⇄ 図鑑）
// ─────────────────────────────────────────────

/**
 * 共通マークを使う写真館と図鑑を切り替える導線。
 *
 * 図鑑側（pokefuta-tracker の inject_site_header.py / site-header.css）と
 * 見た目・文言・項目順を揃えている。片方だけ変えないこと。
 *
 * SP も PC も「マーク＋ポケふた｜写真館＋キャレット」。SP は文字を幅に合わせて小さくする
 * （図鑑の .site-header__brand-name と同じ clamp）。ホームへはメニューの先頭「写真館」＝ `/` から行ける。
 */
function SiteSwitcher({ variant }: { variant: 'sp' | 'pc' }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // SP と PC の2つが同時にマウントされるので、パネルの id は必ずインスタンス固有にする
  const panelId = useId();

  // 項目を選んで閉じたときもフォーカスをトリガーへ戻す。
  // 特に「写真館」を / 上で選ぶとルート遷移が起きず、フォーカス中のリンクが
  // そのまま消えて body に落ちる
  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // ページ遷移したら閉じる（メニュー内の Link は SPA 遷移なので閉じ忘れる）
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 閉じたあとフォーカスが宙に浮かないようトリガーへ戻す
      closeAndRestoreFocus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const itemStyle = (current: boolean): React.CSSProperties => ({
    display: 'block',
    padding: '9px 10px',
    borderRadius: 8,
    color: 'var(--chrome-ink)',
    textDecoration: 'none',
    background: current ? 'var(--chrome-pc-nav-active-bg)' : 'transparent',
  });

  return (
    // SP は図鑑と同じく、狭い画面ではサイト名を「…」で切って認証ボタンを押し出さない
    <div ref={containerRef} className={variant === 'pc' ? 'relative flex-shrink-0' : 'relative min-w-0'}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="サイトを切り替える"
        className="flex min-w-0 max-w-full items-center rounded-lg transition hover:bg-[var(--chrome-accent-soft)]"
        style={{
          // SP は図鑑の .site-switch__trigger と同じく幅に合わせて詰める（320px 幅でも認証ボタンと並ぶように）
          gap: variant === 'pc' ? 8 : 'clamp(5px, 1.8vw, 7px)',
          padding: variant === 'pc' ? '0 6px' : '0 clamp(6px, 2vw, 8px) 0 4px',
          minHeight: 'var(--chrome-tap-min)',
          fontWeight: 700,
          color: variant === 'pc' ? 'var(--chrome-ink-pc)' : 'var(--chrome-ink)',
          fontFamily: ROUND,
        }}
      >
        {/* SP のマークは図鑑の .site-header__mark と同じ大きさ */}
        <BrandMark size={variant === 'pc' ? 30 : 'clamp(26px, 8vw, 30px)'} />
        <span
          style={{
            fontSize: variant === 'pc' ? 18 : 'clamp(12.5px, 3.4vw, 15px)',
            whiteSpace: 'nowrap',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          ポケふた
          <span
            aria-hidden="true"
            style={{ margin: variant === 'pc' ? '0 4px' : '0 clamp(2px, 1vw, 4px)', opacity: 0.45, fontWeight: 600 }}
          >
            ｜
          </span>
          写真館
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '5px solid currentColor',
            flexShrink: 0,
            opacity: 0.55,
            transform: open ? 'rotate(180deg)' : undefined,
          }}
        />
      </button>

      {/* 中身はただのリンク一覧なので menu ロールは付けない。role="menu" を名乗ると
          矢印キーでの項目移動が期待されるが、それは実装していない。aria-expanded に
          よるディスクロージャとして扱う（図鑑側のネイティブ <details> と同じ扱い）。
          aria-controls の参照先が消えないよう、閉じているときも hidden でマウントし続ける */}
      <div
          hidden={!open}
          id={panelId}
          className="absolute left-0 top-[calc(100%+6px)] min-w-[220px] rounded-xl bg-white p-1.5"
          style={{
            border: '1px solid var(--chrome-accent-border)',
            boxShadow: '0 12px 30px rgba(60, 45, 25, .18)',
            zIndex: 1,
          }}
        >
          {/* 「いま写真館にいる」というサイト単位の現在地。ホーム以外でも付くので page は使わない */}
          <Link href="/" aria-current="true" onClick={closeAndRestoreFocus} style={itemStyle(true)}>
            <b style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>写真館</b>
            <small style={{ display: 'block', fontSize: 11, color: 'var(--chrome-pc-nav)' }}>撮る・記録する</small>
          </Link>
          <a href={DATA_SITE_URL} onClick={closeAndRestoreFocus} style={itemStyle(false)}>
            <b style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>図鑑</b>
            <small style={{ display: 'block', fontSize: 11, color: 'var(--chrome-pc-nav)' }}>調べる・探す</small>
          </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SP ヘッダー（<1024px）
// ─────────────────────────────────────────────

/**
 * 要素は「ロゴ（ポケふた｜写真館） / 認証」だけ。図鑑の SP ヘッダーと同じ並び・同じ形にしている。
 * 以前は真ん中にページ名（「石垣のポケふた」など）を出していたが、ページごとに変わって
 * 図鑑と揃わなかったのでやめた。
 * Info・X・図鑑・デザインふたをヘッダーに並べていた頃はタップ領域が潰れていたので、
 * ナビは下タブ、ユーティリティはフッターへ分けている。
 */
function SpHeader({ user, authLoaded }: ChromeState) {
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
        className="mx-auto flex max-w-6xl items-center"
        style={{
          minHeight: 'calc(var(--chrome-height) - 1px)',
          // 図鑑の .site-header__inner と同じ。段（@media）で切らず幅に合わせて連続的に詰める
          padding: '4px clamp(6px, 2.4vw, 12px)',
          gap: 'clamp(4px, 2vw, 8px)',
        }}
      >
        <SiteSwitcher variant="sp" />

        <div className="flex-1" />

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
            <div className="flex flex-shrink-0 items-center gap-2">
              {/* 図鑑の .site-auth__login / .site-auth__signup と同じ形（枠線のピル＋塗りのピル） */}
              <Link
                href="/login?mode=login"
                className="flex items-center whitespace-nowrap rounded-full border font-bold"
                style={{
                  minHeight: 'var(--chrome-tap-min)',
                  padding: '0 clamp(9px, 2.6vw, 13px)',
                  fontSize: 'clamp(12px, 3.2vw, 13px)',
                  borderColor: 'var(--chrome-accent-border)',
                  color: 'var(--chrome-accent)',
                }}
              >
                ログイン
              </Link>
              <Link
                href="/login?mode=signup"
                className="flex items-center whitespace-nowrap rounded-full font-bold text-white"
                style={{
                  minHeight: 'var(--chrome-tap-min)',
                  padding: '0 clamp(9px, 2.6vw, 13px)',
                  fontSize: 'clamp(12px, 3.2vw, 13px)',
                  background: 'var(--chrome-accent)',
                  boxShadow: '0 2px 0 #5f55b8',
                }}
              >
                新規登録
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
  const { trackXLinkClick, trackSubmissionEntry } = useAnalytics();
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
        // スイッチャーのメニューが本文の positioned 要素（固定CTA z-40 など）に
        // 負けないよう、ナビ自身に stacking context を持たせる
        position: 'relative',
        zIndex: 50,
      }}
    >
      <SiteSwitcher variant="pc" />

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
          デザインふた
        </Link>
      </div>

      <div style={{ flex: 1 }} />

      <Link href="/about" style={pcIconBtn} title="このサイトについて" aria-label="このサイトについて">
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
          onClick={() => trackSubmissionEntry({ submission_kind: 'character', surface: 'header' })}
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
              href="/login?mode=login"
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
              href="/login?mode=signup"
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
 * 「図鑑」「デザインふた」は下タブに入れる枠が無い（4枠は 探す/スタンプ帳/マイ旅＋投稿FAB で
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
      {/*
        以前は4リンクを1つの flex-wrap に並べていたが、SP 幅では合計が入らず
        「X @pokemonmanhole」だけが2行目に落ちる。gap-y-1（4px）しか無いので
        意図した2段ではなく事故に見えていた。折り返し任せをやめ、
        サイト内3リンクと外部リンクを別の行として組む。
      */}
      <nav
        aria-label="サイト内リンク"
        className="mx-auto max-w-md px-4 pb-1 pt-3 text-xs font-bold"
      >
        <div className="flex items-center justify-center gap-x-2">
          <a href={DATA_SITE_URL} className="inline-flex items-center px-2" style={footerLinkStyle}>
            図鑑
          </a>
          <Link href="/design-manholes" className="inline-flex items-center px-2" style={footerLinkStyle}>
            デザインふた
          </Link>
          <Link href="/about" className="inline-flex items-center gap-1.5 px-2" style={footerLinkStyle}>
            <Info className="h-4 w-4" />
            このサイトについて
          </Link>
        </div>
        <div className="mt-1 flex items-center justify-center">
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
        </div>
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
  const { trackNavClick, trackSubmissionEntry } = useAnalytics();
  const isLoggedIn = authLoaded && user !== null;
  const hideUploadFab = isSubmissionPage(pathname);

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
          {!hideUploadFab && (
            <div style={{ position: 'absolute', left: '50%', top: -22, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Link
                href="/upload"
                onClick={() => {
                  trackNavClick('投稿');
                  trackSubmissionEntry({ submission_kind: 'character', surface: 'bottom_nav_fab' });
                }}
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
          )}
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
  if (route.bare) return <>{children}</>;

  return (
    <>
      <SpHeader {...state} />
      <PcTopNav {...state} />
      {children}
      <SpUtilityFooter {...state} />
      <BottomNav {...state} />
    </>
  );
}
