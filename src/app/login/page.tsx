'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Camera, Lock, Mail, MapPin, Search, Sparkles, Stamp } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import type { ManholeTitle } from '@/types/database';

type RarePreviewManhole = {
  id: number;
  prefecture?: string | null;
  municipality?: string | null;
  city?: string | null;
  title?: string | null;
  pokemons?: string[] | null;
  titles?: ManholeTitle[] | null;
  hashtags?: string[] | null;
  title_tags?: string[] | null;
};

type RarePreviewItem = {
  id: number;
  badge: string;
  title: string;
  location: string;
  pokemon: string;
};

function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function getAuthErrorMessage(value: string | null) {
  if (value === 'missing_auth_code') return '確認リンクが無効です。メールのリンクをもう一度開いてください。';
  if (value === 'email_confirm_failed') return 'メール確認に失敗しました。確認リンクの有効期限が切れている可能性があります。';
  if (value === 'exchange_failed') return 'Google認証に失敗しました。もう一度お試しください。';
  if (value === 'oauth_access_denied') return 'Googleアカウントへのアクセスが拒否されました。';
  if (value === 'oauth_server_error') return 'Google認証でエラーが発生しました。しばらくしてから再度お試しください。';
  return null;
}

function getLoginErrorMessage(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('rate limit')) return 'ログイン試行回数が上限に達しました。しばらく待ってから再度お試しください。';
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password'))
    return 'メールアドレスまたはパスワードが正しくありません。';
  if (msg.includes('email not confirmed'))
    return 'メールアドレスの確認が完了していません。確認メールのリンクをクリックしてください。';
  return message || 'ログインに失敗しました';
}

function getSignupErrorMessage(message: string): string {
  if (message.includes('already registered') || message.includes('User already registered'))
    return 'このメールアドレスはすでに登録済みです。ログインタブからお試しください。';
  return message || '登録に失敗しました';
}

const getSortedTitles = (titles?: ManholeTitle[] | null) =>
  [...(Array.isArray(titles) ? titles : [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

const getRareBadge = (title?: ManholeTitle) => {
  if (!title) return '称号つき';
  if (title.key === 'unique_pokemon') return '激レア';
  if (title.key === 'rare_pokemon') return 'レア';
  if (['north_end', 'south_end', 'east_end', 'west_end'].includes(title.key)) return '端っこ';
  if (title.key === 'newest') return '新作';
  return '発見候補';
};

const getLocationLabel = (manhole: RarePreviewManhole) =>
  [manhole.prefecture, manhole.city || manhole.municipality].filter(Boolean).join(' ') || '場所未設定';

const getRarePreviewItems = (manholes: RarePreviewManhole[]): RarePreviewItem[] =>
  manholes
    .map((manhole) => {
      const topTitle = getSortedTitles(manhole.titles)[0];
      if (!topTitle) return null;
      return {
        id: manhole.id,
        badge: getRareBadge(topTitle),
        title: topTitle.label,
        location: getLocationLabel(manhole),
        pokemon:
          Array.isArray(manhole.pokemons) && manhole.pokemons.length > 0
            ? manhole.pokemons.slice(0, 2).join('・')
            : manhole.title || 'ポケふた',
      };
    })
    .filter((item): item is RarePreviewItem => item !== null)
    .slice(0, 3);

function RareFomoBox({ items }: { items: RarePreviewItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="relative rounded-2xl border border-[#DDA63A]/30 bg-[#FFF0C7]/90 p-4 flex flex-col gap-3">
      <span className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white border border-[#8C6A4A]/20 flex items-center justify-center shadow-sm">
        <Sparkles className="w-3.5 h-3.5 text-[#B5483C]" />
      </span>
      <div className="pr-10">
        <p className="text-xs font-extrabold text-[#8C6315]">未発見のレアふたが待っています</p>
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#6A4D36]">
          登録すると訪問済みと照らし合わせて、称号つきの候補を探せます。
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/manhole/${item.id}`}
            className="flex items-center gap-2.5 rounded-xl border border-[#8C6A4A]/15 bg-white/80 px-3 py-2 hover:bg-white transition"
          >
            <span className="shrink-0 rounded-full bg-[#B5483C]/10 px-2 py-0.5 text-[10px] font-extrabold text-[#B5483C] whitespace-nowrap">
              {item.badge}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-extrabold text-[#4F3828]">{item.title}</span>
              <span className="mt-0.5 block truncate text-[11px] font-medium text-[#6A4D36]">
                {item.location} / {item.pokemon}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ValueRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-[#7B63A8]/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-[#7B63A8]" />
      </span>
      <div className="min-w-0">
        <p className="font-extrabold text-sm text-[#2A2A2A]">{title}</p>
        <p className="text-xs font-medium text-[#6A4D36] leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirectPath(searchParams.get('redirect'));
  const hasRedirect = redirectTo !== '/';
  const fromRegister = searchParams.get('from') === 'register';
  const fromEmailConfirmed = searchParams.get('from') === 'email_confirmed';
  const fromGoogleOAuth = searchParams.get('from') === 'google_oauth';
  const conversion = searchParams.get('conversion');
  const authError = searchParams.get('auth_error');

  const [mode, setMode] = useState<'signup' | 'login'>(hasRedirect ? 'login' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rarePreviewItems, setRarePreviewItems] = useState<RarePreviewItem[]>([]);

  const supabase = useMemo(() => createBrowserClient(), []);
  const {
    trackLoginStart,
    trackLoginSuccess,
    trackSignupStart,
    trackSignupComplete,
    trackSignupEmailConfirmed,
    setUser,
    trackAuthError,
    updateUserProperties,
  } = useAnalytics();

  useEffect(() => {
    document.title = 'ログイン / 新規登録 - ポケふた訪問記録';
  }, []);

  useEffect(() => {
    const authErrorMessage = getAuthErrorMessage(authError);
    if (!authError || !authErrorMessage) return;
    setError(authErrorMessage);
    trackAuthError(authError, authErrorMessage);
  }, [authError, trackAuthError]);

  useEffect(() => {
    if (!fromEmailConfirmed || conversion !== 'signup_email_confirmed') return;
    let isMounted = true;
    const complete = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!isMounted || !session?.user?.id) return;
      const storageKey = `pokefuta:signup_email_confirmed:${session.user.id}`;
      if (sessionStorage.getItem(storageKey) !== 'true') {
        setUser(session.user.id);
        trackSignupEmailConfirmed({
          conversion_type: 'signup_email_confirmed',
          redirect_target: redirectTo,
          auth_flow: 'email_confirmation',
        });
        updateUserProperties({ registered_user: true });
        sessionStorage.setItem(storageKey, 'true');
      }
      router.replace(redirectTo);
      router.refresh();
    };
    complete().catch((err) => console.error('メール確認後のログイン状態確認に失敗:', err));
    return () => {
      isMounted = false;
    };
  }, [conversion, fromEmailConfirmed, redirectTo, router, setUser, supabase, trackSignupEmailConfirmed, updateUserProperties]);

  useEffect(() => {
    if (!fromGoogleOAuth) return;
    let isMounted = true;
    const complete = async () => {
      let session = null;

      // The route handler passes the raw OAuth code in the URL so we can exchange
      // it client-side. This avoids Next.js 14 App Router's unreliable Set-Cookie
      // propagation through NextResponse.redirect() in server Route Handlers.
      const oauthCode = searchParams.get('code');
      if (oauthCode) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(oauthCode);
        if (exchangeError) {
          // Code may have already been used (e.g. page refresh). Check if already logged in.
          const { data: existing } = await supabase.auth.getSession();
          if (existing.session?.user?.id) {
            session = existing.session;
          } else {
            if (isMounted) setError('Google認証に失敗しました。もう一度お試しください。');
            return;
          }
        } else {
          session = data.session;
        }
      } else {
        // Fallback: server-side exchange already set the session (older path)
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }

      if (!isMounted || !session?.user?.id) return;

      // Read intent stored before OAuth redirect; fall back to safe defaults
      let oauthNext = '/';
      let oauthMode = 'login';
      try {
        const stored = sessionStorage.getItem('pokefuta:oauth_intent');
        if (stored) {
          const parsed = JSON.parse(stored);
          oauthNext = getSafeRedirectPath(parsed.next) || '/';
          oauthMode = parsed.mode || 'login';
        }
      } catch {}
      sessionStorage.removeItem('pokefuta:oauth_intent');

      // Analytics fire once per login (idempotent via storageKey)
      const storageKey = `pokefuta:google_oauth:${session.user.id}`;
      if (sessionStorage.getItem(storageKey) !== 'true') {
        setUser(session.user.id);
        if (oauthMode === 'signup') {
          trackSignupComplete();
        } else {
          trackLoginSuccess();
        }
        updateUserProperties({ registered_user: true });
        sessionStorage.setItem(storageKey, 'true');
      }

      // Always redirect to destination regardless of whether analytics fired
      router.replace(oauthNext);
      router.refresh();
    };
    complete().catch((err) => console.error('Google OAuth後のログイン状態確認に失敗:', err));
    return () => {
      isMounted = false;
    };
  }, [fromGoogleOAuth, router, searchParams, setError, setUser, supabase, trackLoginSuccess, trackSignupComplete, updateUserProperties]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const response = await fetch('/api/manholes/rare-preview');
        const data = await response.json();
        if (!response.ok || data?.success === false)
          throw new Error(data?.details || data?.error || 'Failed');
        const manholes: RarePreviewManhole[] = Array.isArray(data?.manholes) ? data.manholes : [];
        const items = getRarePreviewItems(
          manholes.filter((m) => Array.isArray(m.titles) && m.titles.length > 0),
        );
        if (isMounted) setRarePreviewItems(items);
      } catch (err) {
        console.warn('レアポケふた候補の取得に失敗:', err);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    trackLoginStart();
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        trackAuthError(signInError.name || 'login_error', signInError.message);
        throw signInError;
      }
      if (data.session) {
        if (data.user?.id) setUser(data.user.id);
        trackLoginSuccess();
        updateUserProperties({ registered_user: true });
        router.push(redirectTo);
        router.refresh();
      } else {
        setError('ログインに失敗しました。セッションが作成されませんでした。');
      }
    } catch (err: any) {
      setError(getLoginErrorMessage(err?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    trackSignupStart();
    try {
      if (password.length < 8) throw new Error('パスワードは8文字以上で入力してください');
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pokefuta.com';
      const callbackUrl = new URL('/auth/callback', origin);
      callbackUrl.searchParams.set('next', '/upload');
      callbackUrl.searchParams.set('conversion', 'signup_email_confirmed');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          data: {},
        },
      });
      if (signUpError) throw signUpError;
      if (data.user) {
        setUser(data.user.id);
        trackSignupComplete();
        router.push('/login?from=register&redirect=/upload');
      }
    } catch (err: any) {
      trackAuthError(err.name || 'signup_error', err.message);
      setError(getSignupErrorMessage(err.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    if (mode === 'signup') trackSignupStart();
    else trackLoginStart();
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pokefuta.com';
      // Store intent in sessionStorage so the login page can read it after callback.
      sessionStorage.setItem('pokefuta:oauth_intent', JSON.stringify({ next: redirectTo, mode }));
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/callback` },
      });
      if (oauthError) throw oauthError;
    } catch (err: any) {
      trackAuthError(err.name || 'google_oauth_error', err.message);
      setError(err.message || 'Google認証に失敗しました');
      setLoading(false);
    }
  };

  const switchMode = (next: 'signup' | 'login') => {
    setMode(next);
    setError(null);
  };

  const renderAuthContent = () => (
    <div className="flex flex-col gap-4">
      {/* Tab toggle */}
      <div className="grid grid-cols-2 rounded-xl bg-[#F6EEDC] p-1 text-sm font-bold">
        <button
          type="button"
          onClick={() => switchMode('signup')}
          className={`rounded-lg py-2 transition ${
            mode === 'signup' ? 'bg-white text-[#7B63A8] shadow-sm' : 'text-[#8C6A4A] hover:text-[#7B63A8]'
          }`}
        >
          新規登録
        </button>
        <button
          type="button"
          onClick={() => switchMode('login')}
          className={`rounded-lg py-2 transition ${
            mode === 'login' ? 'bg-white text-[#7B63A8] shadow-sm' : 'text-[#8C6A4A] hover:text-[#7B63A8]'
          }`}
        >
          ログイン
        </button>
      </div>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={loading}
        className="flex items-center justify-center gap-2.5 w-full rounded-xl border border-[#8C6A4A]/20 bg-white px-4 py-3 text-sm font-bold text-[#2A2A2A] shadow-sm hover:bg-gray-50 transition disabled:opacity-60"
        aria-label={mode === 'signup' ? 'Googleではじめる' : 'Googleでログイン'}
      >
        <span className="w-5 h-5 rounded-full border-2 border-[#8C6A4A]/30 flex items-center justify-center text-[10px] font-extrabold leading-none select-none">
          G
        </span>
        {mode === 'signup' ? 'Googleではじめる' : 'Googleでログイン'}
      </button>

      {/* OR divider */}
      <div className="flex items-center gap-3 text-[#8C6A4A]/70 text-xs" role="separator">
        <span className="flex-1 h-px bg-[#8C6A4A]/20" />
        または
        <span className="flex-1 h-px bg-[#8C6A4A]/20" />
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#B5483C]/30 bg-[#F8D9C4] p-3 flex items-center gap-2 text-[#B5483C]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold">{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={mode === 'signup' ? handleSignup : handleLogin} className="flex flex-col gap-3">
        <div>
          <label className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-[#6A4D36]">
            <Mail className="w-3.5 h-3.5" />
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading}
            autoComplete="email"
            className="w-full rounded-xl border border-[#8C6A4A]/20 bg-white/80 px-3 py-2.5 text-sm font-medium text-[#2A2A2A] outline-none transition focus:border-[#7B63A8] focus:ring-2 focus:ring-[#7B63A8]/15 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#6A4D36]">
              <Lock className="w-3.5 h-3.5" />
              パスワード
            </span>
            {mode === 'signup' && (
              <span className="text-[11px] font-medium text-[#8C6A4A]">8文字以上</span>
            )}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={loading}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full rounded-xl border border-[#8C6A4A]/20 bg-white/80 px-3 py-2.5 text-sm font-medium text-[#2A2A2A] outline-none transition focus:border-[#7B63A8] focus:ring-2 focus:ring-[#7B63A8]/15 disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#7B63A8] px-4 py-3.5 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] hover:bg-[#6A5299] transition disabled:opacity-60"
        >
          {mode === 'signup' ? (
            <>
              <Stamp className="w-4 h-4" />
              {loading ? '登録中...' : '無料でスタンプ帳をはじめる'}
            </>
          ) : (
            <>{loading ? 'ログイン中...' : 'ログインして続ける'}</>
          )}
        </button>
      </form>

      {/* Footer note */}
      {mode === 'signup' ? (
        <p className="text-[11px] text-[#8C6A4A] leading-relaxed text-center">
          登録すると{' '}
          <Link href="/terms" className="text-[#7B63A8] font-bold underline-offset-2 hover:underline">
            利用規約
          </Link>{' '}
          と{' '}
          <Link href="/privacy" className="text-[#7B63A8] font-bold underline-offset-2 hover:underline">
            プライバシーポリシー
          </Link>{' '}
          に同意したものとみなします。
        </p>
      ) : (
        <button
          type="button"
          className="flex items-center justify-center gap-1 text-xs font-bold text-[#7B63A8] mx-auto hover:opacity-70 transition"
        >
          パスワードをお忘れですか？
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6EEDC] flex flex-col">
      {/* Auth header */}
      <header className="shrink-0 bg-[#FFF8EB] border-b border-[#8C6A4A]/20 px-4 py-3 flex items-center gap-2">
        <span className="font-extrabold text-[#7B63A8] text-base leading-tight">ポケふた写真館</span>
        <span className="flex-1" />
        <Link
          href="/nearby"
          className="flex items-center gap-1 text-xs font-bold text-[#8C6A4A] hover:text-[#7B63A8] transition"
        >
          <Search className="w-3.5 h-3.5" />
          探すへ
        </Link>
      </header>

      {/* Notification banners */}
      {(fromRegister || fromEmailConfirmed) && (
        <div className="px-4 pt-4 lg:px-6">
          <div className="max-w-5xl mx-auto rounded-xl border border-[#FFB347]/50 bg-[#FFF0C7] p-3 flex items-start gap-2">
            <Mail className="w-4 h-4 shrink-0 mt-0.5 text-[#9B5C2E]" />
            <div>
              <p className="text-xs font-extrabold text-[#4F3828]">登録完了！</p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#6A4D36]">
                登録したメールアドレスに確認メールが送信されました。メール内のリンクをクリックして確認を完了してください。
              </p>
            </div>
          </div>
        </div>
      )}
      {hasRedirect && !fromRegister && (
        <div className="px-4 pt-4 lg:px-6">
          <div className="max-w-5xl mx-auto rounded-xl border border-[#7B63A8]/20 bg-white/70 p-3">
            <p className="text-xs font-bold leading-relaxed text-[#7B63A8]">
              ログイン後、指定されたページに移動します。
            </p>
          </div>
        </div>
      )}

      {/* SP layout */}
      <main className="lg:hidden flex-1 p-4 flex flex-col gap-4 pb-10">
        {/* Hero card */}
        <div className="rounded-2xl border border-[#8C6A4A]/20 bg-[#FFF7E5] p-4 flex flex-col gap-2.5">
          <span className="inline-flex items-center gap-1.5 self-start bg-[#FFB347]/25 text-[#7B63A8] font-extrabold text-xs px-3 py-1 rounded-full">
            <Sparkles className="w-3 h-3" />
            ポケふたスタンプ帳
          </span>
          <h1 className="font-extrabold text-xl leading-snug text-[#2A2A2A]">
            470か所のポケふたを、
            <br />
            あなただけのスタンプ帳に。
          </h1>
          <p className="text-xs font-medium leading-relaxed text-[#6A4D36]">
            旅先のポケふたを写真で記録。次に巡る一枚も、ここから。
          </p>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-[#8C6A4A]/20 bg-[#FFF7E5] p-4">
          {renderAuthContent()}
        </div>

        {/* Feature chips */}
        <div className="grid grid-cols-3 gap-2" aria-label="できること">
          {(
            [
              { icon: MapPin, label: '記録' },
              { icon: Camera, label: '写真' },
              { icon: Stamp, label: '達成率' },
            ] as const
          ).map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="rounded-xl border border-[#8C6A4A]/20 bg-[#FFF7E5] px-2 py-3 flex flex-col items-center gap-1.5"
            >
              <Icon className="w-5 h-5 text-[#7B63A8]" />
              <span className="text-xs font-bold text-[#4F3828]">{label}</span>
            </div>
          ))}
        </div>

        <RareFomoBox items={rarePreviewItems} />
      </main>

      {/* PC layout */}
      <main className="hidden lg:flex flex-1 items-start p-6">
        <div
          className="w-full max-w-5xl mx-auto rounded-3xl overflow-hidden border border-[#8C6A4A]/20 shadow-xl bg-[#FFF7E5] grid"
          style={{ gridTemplateColumns: '1.06fr 0.94fr', minHeight: 560 }}
        >
          {/* Left: Value panel */}
          <div className="p-10 flex flex-col gap-5">
            <span className="inline-flex items-center gap-1.5 self-start bg-[#FFB347]/25 text-[#7B63A8] font-extrabold text-xs px-3 py-1 rounded-full">
              <Sparkles className="w-3 h-3" />
              ポケふたスタンプ帳
            </span>
            <h1 className="font-extrabold text-[33px] leading-tight tracking-tight text-[#2A2A2A]">
              470か所のポケふたを、
              <br />
              あなただけのスタンプ帳に。
            </h1>
            <p className="text-sm font-medium leading-relaxed text-[#6A4D36]">
              旅先で見つけたポケふたを写真で記録。訪問済みの場所も、次に巡る一枚も、ここから。
            </p>
            <div className="flex flex-col gap-4 mt-1">
              <ValueRow icon={MapPin} title="行った場所を記録" desc="訪問したポケふたが地図とリストに残る" />
              <ValueRow icon={Camera} title="写真で思い出を保存" desc="撮った一枚がそのまま図鑑のスタンプに" />
              <ValueRow icon={Stamp} title="都道府県の達成率" desc="47都道府県・470種の収集状況がひと目で" />
            </div>
            <div className="mt-auto pt-4">
              <RareFomoBox items={rarePreviewItems} />
            </div>
          </div>

          {/* Right: Auth form */}
          <div className="border-l border-[#8C6A4A]/20 bg-[#FFF8EB]/70 p-10 flex flex-col justify-center">
            <div className="flex flex-col gap-1 mb-6">
              <h2 className="font-extrabold text-xl text-[#2A2A2A]">
                {mode === 'signup' ? '無料ではじめる' : 'ログインして続ける'}
              </h2>
              <p className="text-sm text-[#6A4D36]">
                {mode === 'signup'
                  ? '30秒でスタンプ帳ができます。すでにお持ちの方はログインへ。'
                  : 'スタンプ帳の続きに戻れます。'}
              </p>
            </div>
            {renderAuthContent()}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6EEDC] flex items-center justify-center">
          <div className="font-pixelJp text-[#7B63A8]">
            読み込み中<span className="rpg-loading" />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
