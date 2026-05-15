'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { LogIn, Mail, Lock, AlertCircle, Info } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import TermsOfService from '@/components/TermsOfService';
import PassportPreview from '@/components/PassportPreview';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const fromRegister = searchParams.get('from') === 'register';
  const isFromStampRally = redirectTo === '/visits';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(!isFromStampRally);
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
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F3E7CC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* スタンプ帳専用オンボーディング */}
        {isFromStampRally && !showLoginForm && (
          <PassportPreview onLoginClick={() => setShowLoginForm(true)} />
        )}

        {/* 通常のログインフォーム */}
        {showLoginForm && (
          <>
        {/* Header */}
        <div className="rounded-lg border border-[#8C6A4A]/20 bg-[#FFF7E5] p-6 shadow-[0_12px_30px_rgba(95,68,42,0.13)] text-center mb-6">
          <div className="inline-block mb-3">
            <div className="w-16 h-16 bg-[#F8D9C4] border-2 border-[#B5483C]/30 rounded-lg flex items-center justify-center mx-auto">
              <LogIn className="w-8 h-8 text-[#B5483C]" />
            </div>
          </div>
          <h1 className="font-pixelJp text-xl font-bold text-[#4F3828]">ログイン</h1>
          <p className="font-pixelJp text-sm text-[#6A4D36] mt-2">
            アカウント作成済みの方はこちら
          </p>
          {fromRegister && (
            <div className="mt-4 pt-4 border-t border-[#8C6A4A]/15">
              <div className="bg-[#DFF1E9] border-2 border-[#3F9D7D] p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <Mail className="w-5 h-5 text-[#2C765E] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-pixelJp text-sm font-bold text-[#2C765E] mb-1">
                      登録完了！
                    </p>
                    <p className="font-pixelJp text-xs text-[#2C765E] leading-relaxed">
                      登録したメールアドレスに確認メールが送信されました。メール内のリンクをクリックして確認を完了してください。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Login Form */}
        <div className="rounded-lg border border-[#8C6A4A]/20 bg-[#FFF7E5] p-6 shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="bg-[#F8D9C4] border-2 border-[#B5483C] p-3 rounded-lg">
                <div className="flex items-center gap-2 text-[#B5483C]">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-pixelJp text-sm">{error}</span>
                </div>
              </div>
            )}

            {/* Email Input */}
            <div>
              <label className="flex items-center gap-2 font-pixelJp text-sm font-bold text-[#4F3828] mb-2">
                <Mail className="w-4 h-4 text-[#6A4D36]" />
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-[#8C6A4A]/25 rounded-md p-3 font-pixelJp text-sm text-[#4F3828] focus:border-[#B5483C] focus:ring-2 focus:ring-[#B5483C]/20 focus:outline-none transition-colors"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="flex items-center gap-2 font-pixelJp text-sm font-bold text-[#4F3828] mb-2">
                <Lock className="w-4 h-4 text-[#6A4D36]" />
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-[#8C6A4A]/25 rounded-md p-3 font-pixelJp text-sm text-[#4F3828] focus:border-[#B5483C] focus:ring-2 focus:ring-[#B5483C]/20 focus:outline-none transition-colors"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {/* Login Button */}
            <button
              type="submit"
              className="w-full bg-[#B5483C] hover:bg-[#9B3D2F] active:bg-[#8B2D1F] text-white font-pixelJp font-bold py-3 px-4 rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          {/* Terms of Service Link */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowTerms(!showTerms)}
              className="flex items-center gap-1 font-pixelJp text-xs text-[#3F9D7D] hover:text-[#2C765E] transition-colors mx-auto"
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
                className="border-[#8C6A4A]/25"
              />
            </div>
          )}

          {/* Sign Up Link */}
          <div className="mt-6 pt-4 border-t border-[#8C6A4A]/15 text-center">
            <p className="font-pixelJp text-sm text-[#6A4D36] mb-3">
              アカウントをお持ちでない方
            </p>
            <Link href="/signup" className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 bg-white border-2 border-[#8C6A4A]/25 hover:border-[#8C6A4A]/40 rounded-lg font-pixelJp text-sm font-bold text-[#4F3828] transition-colors">
              新規登録
            </Link>
          </div>
        </div>
          </>
        )}

        {/* スタンプ帳からのアクセス時、戻るリンク */}
        {isFromStampRally && showLoginForm && (
          <div className="text-center mt-4">
            <button
              onClick={() => setShowLoginForm(false)}
              className="font-pixelJp text-sm text-[#3F9D7D] hover:text-[#2C765E] transition-colors flex items-center gap-1 mx-auto"
            >
              <span>←</span>
              <span>プレビューに戻る</span>
            </button>
          </div>
        )}
      </div>

        <BottomNav />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F3E7CC] flex items-center justify-center">
        <div className="font-pixelJp text-[#4F3828] text-lg">
          読み込み中<span className="rpg-loading"></span>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
