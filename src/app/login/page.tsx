'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { LogIn, Mail, Lock, AlertCircle, Info } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import TermsOfService from '@/components/TermsOfService';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const fromRegister = searchParams.get('from') === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient();
  const { trackSignIn, setUser, trackAuthError } = useAnalytics();

  // ページタイトル設定
  useEffect(() => {
    document.title = 'ログイン - ポケふた訪問記録';
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('🔐 ログイン試行開始:', { email, redirectTo });

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

        // ✅ GA: ユーザーID設定（ユーザーIDが取得できた時のみ）
        if (data.user?.id) {
          setUser(data.user.id);
        }
        // ✅ GA: ログインイベント追跡
        trackSignIn();

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
      setError(err.message || 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-rpg-bgDark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="rpg-window text-center mb-6">
          <div className="inline-block mb-3">
            <div className="w-16 h-16 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center mx-auto">
              <LogIn className="w-8 h-8 text-rpg-textDark" />
            </div>
          </div>
          <h1 className="font-pixelJp text-lg text-rpg-textGold font-bold">ログイン</h1>
          <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mt-1">
            アカウント作成済みの方はこちら
          </p>
          {fromRegister && (
            <div className="mt-3 pt-3 border-t-2 border-rpg-border">
              <div className="bg-rpg-yellow/20 border-2 border-rpg-yellow p-2 rounded">
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-rpg-yellow flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-pixelJp text-xs font-bold text-rpg-textDark mb-1">
                      登録完了！
                    </p>
                    <p className="font-pixelJp text-[11px] text-rpg-textDark leading-relaxed">
                      登録したメールアドレスに確認メールが送信されました。メール内のリンクをクリックして確認を完了してください。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Login Form */}
        <div className="rpg-window">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="bg-rpg-red/20 border-2 border-rpg-red p-3">
                <div className="flex items-center gap-2 text-rpg-red">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-pixelJp text-xs">{error}</span>
                </div>
              </div>
            )}

            {/* Email Input */}
            <div>
              <label className="flex items-center gap-2 font-pixelJp text-sm text-rpg-textDark mb-2">
                <Mail className="w-4 h-4" />
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-rpg-bgLight border-2 border-rpg-border p-3 font-pixelJp text-sm text-rpg-textDark focus:border-rpg-yellow focus:outline-none"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="flex items-center gap-2 font-pixelJp text-sm text-rpg-textDark mb-2">
                <Lock className="w-4 h-4" />
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-rpg-bgLight border-2 border-rpg-border p-3 font-pixelJp text-sm text-rpg-textDark focus:border-rpg-yellow focus:outline-none"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {/* Login Button */}
            <button
              type="submit"
              className="w-full rpg-button rpg-button-primary py-3"
              disabled={loading}
            >
              <span className="font-pixelJp">
                {loading ? 'ログイン中...' : 'ログイン'}
              </span>
            </button>
          </form>

          {/* Terms of Service Link */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowTerms(!showTerms)}
              className="flex items-center gap-1 font-pixelJp text-xs text-rpg-blue hover:opacity-70 transition-opacity mx-auto"
            >
              <Info className="w-3 h-3" />
              <span>利用規約を確認</span>
            </button>
          </div>

          {showTerms && (
            <div className="mt-3">
              <TermsOfService
                isChecked={false}
                onCheckChange={() => {}}
                className="border-rpg-yellow"
              />
            </div>
          )}

          {/* Sign Up Link */}
          <div className="mt-6 pt-4 border-t-2 border-rpg-border text-center">
            <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mb-2">
              アカウントをお持ちでない方
            </p>
            <Link href="/signup" className="rpg-button text-xs">
              <span className="font-pixelJp">新規登録</span>
            </Link>
          </div>
        </div>
      </div>

        <BottomNav />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen safe-area-inset pb-nav-safe bg-rpg-bgDark flex items-center justify-center">
        <div className="font-pixelJp text-rpg-textGold">
          読み込み中<span className="rpg-loading"></span>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
