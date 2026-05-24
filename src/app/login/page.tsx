'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { AlertCircle, Camera, Info, Lock, LogIn, Mail, Map, Sparkles, Stamp } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import TermsOfService from '@/components/TermsOfService';
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
  if (value === 'missing_auth_code') {
    return '確認リンクが無効です。メールのリンクをもう一度開いてください。';
  }
  if (value === 'email_confirm_failed') {
    return 'メール確認に失敗しました。確認リンクの有効期限が切れている可能性があります。';
  }
  return null;
}

function getLoginErrorMessage(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('rate limit')) {
    return 'ログイン試行回数が上限に達しました。しばらく待ってから再度お試しください。';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (msg.includes('email not confirmed')) {
    return 'メールアドレスの確認が完了していません。確認メールのリンクをクリックしてください。';
  }
  return message || 'ログインに失敗しました';
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
        pokemon: Array.isArray(manhole.pokemons) && manhole.pokemons.length > 0
          ? manhole.pokemons.slice(0, 2).join('・')
          : manhole.title || 'ポケふた',
      };
    })
    .filter((item): item is RarePreviewItem => item !== null)
    .slice(0, 3);

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirectPath(searchParams.get('redirect'));
  const hasRedirect = redirectTo !== '/';
  const fromRegister = searchParams.get('from') === 'register';
  const fromEmailConfirmed = searchParams.get('from') === 'email_confirmed';
  const conversion = searchParams.get('conversion');
  const authError = searchParams.get('auth_error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rarePreviewItems, setRarePreviewItems] = useState<RarePreviewItem[]>([]);

  const supabase = useMemo(() => createBrowserClient(), []);
  const {
    trackLoginStart,
    trackLoginSuccess,
    trackSignupEmailConfirmed,
    setUser,
    trackAuthError,
    updateUserProperties,
  } = useAnalytics();

  // ページタイトル設定
  useEffect(() => {
    document.title = 'ログイン - ポケふた訪問記録';
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

    const completeEmailConfirmation = async () => {
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

    completeEmailConfirmation().catch((err) => {
      console.error('メール確認後のログイン状態確認に失敗:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [
    conversion,
    fromEmailConfirmed,
    redirectTo,
    router,
    setUser,
    supabase,
    trackSignupEmailConfirmed,
    updateUserProperties,
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadRarePreview = async () => {
      try {
        const response = await fetch('/api/manholes/rare-preview');
        const data = await response.json();
        if (!response.ok || data?.success === false) {
          throw new Error(data?.details || data?.error || 'Failed to load rare manhole preview');
        }
        const manholes: RarePreviewManhole[] = Array.isArray(data?.manholes) ? data.manholes : [];
        const previewItems = getRarePreviewItems(
          manholes.filter((manhole) => Array.isArray(manhole.titles) && manhole.titles.length > 0)
        );

        if (isMounted) {
          setRarePreviewItems(previewItems);
        }
      } catch (err) {
        console.warn('レアポケふた候補の取得に失敗しました:', err);
      }
    };

    loadRarePreview();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('🔐 ログイン試行開始:', { email, redirectTo });
    trackLoginStart();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('📡 Supabase認証レスポンス:', {
        hasSession: !!data.session,
        hasUser: !!data.user,
        error: error,
      });

      if (error) {
        console.error('❌ ログインエラー:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
        // ✅ GA: 認証エラー追跡
        trackAuthError(error.name || 'login_error', error.message);
        throw error;
      }

      if (data.session) {
        console.log('✅ ログイン成功:', {
          userId: data.user?.id,
          email: data.user?.email,
          redirectTo,
        });

        if (data.user?.id) {
          setUser(data.user.id);
        }
        trackLoginSuccess();
        updateUserProperties({ registered_user: true });

        // app_userレコードの存在確認
        const { data: appUser, error: appUserError } = await supabase
          .from('app_user')
          .select('auth_uid, display_name')
          .eq('auth_uid', data.user.id)
          .single();

        if (appUserError) {
          console.warn('⚠️ app_userレコードの取得に失敗:', appUserError.message);
        } else {
          console.log('✅ app_userレコード確認:', appUser);
        }

        console.log('🔄 リダイレクト中...', redirectTo);
        router.push(redirectTo);
        router.refresh();
      } else {
        console.error('❌ セッションが作成されませんでした');
        setError('ログインに失敗しました。セッションが作成されませんでした。');
      }
    } catch (err: any) {
      console.error('❌ ログイン処理でエラー発生:', err);
      setError(getLoginErrorMessage(err?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const benefitItems = [
    {
      icon: <Stamp className="h-5 w-5" />,
      title: 'スタンプ帳の続き',
      description: '集めた訪問履歴と達成率をそのまま確認できます',
    },
    {
      icon: <Camera className="h-5 w-5" />,
      title: '写真投稿に戻る',
      description: '旅先で撮ったポケふた写真をすぐ記録できます',
    },
    {
      icon: <Map className="h-5 w-5" />,
      title: '都道府県別の進捗',
      description: '次に巡る場所や未訪問の候補を探せます',
    },
  ];

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-6 sm:py-10">
        <section className="relative w-full overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-5 sm:p-8 lg:p-10">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
                <LogIn className="h-3.5 w-3.5" />
                旅の続き
              </div>

              <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
                旅の続きにログイン
              </h1>
              <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-[#6A4D36] sm:text-base">
                保存した訪問履歴、スタンプ帳、写真投稿画面に戻れます。次に巡るポケふたも、ここからまた探せます。
              </p>

              <div className="mt-6 grid gap-3">
                {benefitItems.map((item) => (
                  <div key={item.title} className="flex items-start gap-3 rounded-[8px] border border-[#8C6A4A]/15 bg-white/65 p-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#7B63A8]/10 text-[#7B63A8]">
                      {item.icon}
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-[#4F3828]">{item.title}</h2>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-[#6A4D36]">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {rarePreviewItems.length > 0 && (
                <div className="mt-5 rounded-[8px] border border-[#DDA63A]/30 bg-[#FFF0C7]/80 p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold text-[#8C6315]">未発見のレアふたが待っています</p>
                      <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#6A4D36]">
                        ログインすると訪問済みと照らし合わせて、称号つき候補を探せます。
                      </p>
                    </div>
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#B5483C]">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {rarePreviewItems.map((item) => (
                      <Link
                        key={item.id}
                        href={`/manhole/${item.id}`}
                        className="group flex items-center gap-3 rounded-[7px] border border-[#8C6A4A]/15 bg-white/75 px-3 py-2 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
                      >
                        <span className="w-[58px] flex-shrink-0 rounded-full bg-[#B5483C]/10 px-2 py-1 text-center text-[10px] font-extrabold text-[#B5483C]">
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
              )}
            </div>

            <div className="border-t border-[#8C6A4A]/15 bg-[#FFF8EB]/80 p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              {fromRegister && (
                <div className="mb-4 rounded-[8px] border border-[#FFB347]/50 bg-[#FFF0C7] p-3">
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#9B5C2E]" />
                    <div>
                      <p className="text-xs font-extrabold text-[#4F3828]">登録完了！</p>
                      <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#6A4D36]">
                        登録したメールアドレスに確認メールが送信されました。メール内のリンクをクリックして確認を完了してください。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {hasRedirect && (
                <div className="mb-4 rounded-[8px] border border-[#7B63A8]/20 bg-white/70 p-3">
                  <p className="text-xs font-bold leading-relaxed text-[#7B63A8]">
                    ログイン後、指定されたページに移動します。
                  </p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                  <div className="rounded-[8px] border border-[#B5483C]/30 bg-[#F8D9C4] p-3">
                    <div className="flex items-center gap-2 text-[#B5483C]">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-xs font-bold">{error}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#4F3828]">
                    <Mail className="h-4 w-4" />
                    メールアドレス
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-[8px] border border-[#8C6A4A]/20 bg-white/80 p-3 text-sm font-medium text-[#2A2A2A] outline-none transition focus:border-[#7B63A8] focus:ring-2 focus:ring-[#7B63A8]/15"
                    placeholder="your@email.com"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#4F3828]">
                    <Lock className="h-4 w-4" />
                    パスワード
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-[8px] border border-[#8C6A4A]/20 bg-white/80 p-3 text-sm font-medium text-[#2A2A2A] outline-none transition focus:border-[#7B63A8] focus:ring-2 focus:ring-[#7B63A8]/15"
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299] disabled:opacity-60"
                  disabled={loading}
                >
                  <LogIn className="h-4 w-4" />
                  <span>{loading ? 'ログイン中...' : '旅の続きへ戻る'}</span>
                </button>
              </form>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowTerms(!showTerms)}
                  className="mx-auto flex items-center gap-1 text-xs font-bold text-[#7B63A8] transition hover:opacity-70"
                >
                  <Info className="h-3 w-3" />
                  <span>利用規約を確認</span>
                </button>
              </div>

              {showTerms && (
                <div className="mt-3">
                  <TermsOfService
                    isChecked={false}
                    onCheckChange={() => {}}
                    className="border-[#FFB347]"
                  />
                </div>
              )}

              <div className="mt-6 border-t border-[#8C6A4A]/15 pt-4 text-center">
                <p className="mb-2 text-xs font-medium text-[#6A4D36]">
                  まだ記録を始めていない方
                </p>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-lg border border-[#7B63A8] bg-white px-4 py-2 text-xs font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
                >
                  無料でスタンプ帳をはじめる
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] flex items-center justify-center">
        <div className="font-pixelJp text-[#7B63A8]">
          読み込み中<span className="rpg-loading"></span>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
