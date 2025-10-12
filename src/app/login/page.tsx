'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient();

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
        throw error;
      }

      if (data.session) {
        console.log('✅ ログイン成功:', {
          userId: data.user?.id,
          email: data.user?.email,
          redirectTo,
        });

        // app_userレコードの存在確認
        const { data: appUser, error: appUserError } = await supabase
          .from('app_user')
          .select('id, auth_uid, email, display_name')
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
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <div className="w-20 h-20 bg-rpg-yellow border-4 border-rpg-border flex items-center justify-center mx-auto">
              <LogIn className="w-10 h-10 text-rpg-textDark" />
            </div>
          </div>
          <h1 className="font-pixelJp text-2xl text-rpg-yellow mb-2" style={{
            textShadow: '3px 3px 0 #34495E'
          }}>
            ログイン
          </h1>
          <p className="font-pixelJp text-sm text-rpg-textDark opacity-70">
            冒険を続けるにはログインしてください
          </p>
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

        {/* Back to Home */}
        <div className="mt-4 text-center">
          <Link href="/" className="font-pixelJp text-xs text-rpg-yellow hover:opacity-70">
            ← ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen safe-area-inset bg-rpg-bgDark flex items-center justify-center">
        <div className="font-pixelJp text-rpg-textGold">
          読み込み中<span className="rpg-loading"></span>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
