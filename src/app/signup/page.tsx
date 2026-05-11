'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import TermsOfService from '@/components/TermsOfService';
import BottomNav from '@/components/BottomNav';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserClient();
  const { trackSignUp, trackAuthError, setUser } = useAnalytics();

  // ページタイトル設定
  useEffect(() => {
    document.title = '新規登録 - ポケふた訪問記録';
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // パスワード検証
      if (password.length < 6) {
        throw new Error('パスワードは6文字以上で入力してください');
      }

      // サインアップ
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split('@')[0],
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.user) {
        console.log('✅ Supabase Auth登録成功:', {
          userId: data.user.id,
          email: data.user.email,
        });

        // ✅ GA: ユーザーID設定（GA4では user_id は gtag('set') で設定）
        setUser(data.user.id);
        // ✅ GA: サインアップイベント追跡
        trackSignUp();

        // ✅ app_user は初回の関連API利用時に自動作成される（/api/image-upload、like/bookmark/comment 等で）
        // signup では auth.signUp() のみで完了
        console.log('📝 signup完了。プロフィールは初回の関連API利用時に自動作成されます。');

        setSuccess(true);

        // 2秒後にログインページへリダイレクト（メール確認を促す）
        setTimeout(() => {
          router.push('/login?from=register&redirect=/upload');
        }, 2000);
      }
    } catch (err: any) {
      console.error('Sign up error:', err);
      // ✅ GA: 認証エラー追跡
      trackAuthError(err.name || 'signup_error', err.message);
      setError(err.message || '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-rpg-bgDark">
      <div className="w-full max-w-md mx-auto p-4">
        {/* Header */}
        <div className="rpg-window text-center mb-6">
          <div className="inline-block mb-3">
            <div className="w-16 h-16 bg-rpg-blue border-2 border-rpg-border flex items-center justify-center mx-auto">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="font-pixelJp text-lg text-rpg-textGold font-bold">アカウント作成</h1>
          <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mt-1">
            登録すると訪問履歴が使えるようになります
          </p>
          <div className="mt-3 pt-3 border-t-2 border-rpg-border">
            <p className="font-pixelJp text-[11px] text-rpg-textDark opacity-80 leading-relaxed">
              GPS位置情報を公開して共有するため、メール確認が必要です。
            </p>
          </div>
        </div>

        {/* Sign Up Form */}
        <div className="rpg-window">
          {success ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-rpg-green mx-auto mb-4" />
              <h2 className="font-pixelJp text-lg text-rpg-green mb-2">登録完了!</h2>
              <p className="font-pixelJp text-sm text-rpg-textDark opacity-70">
                ログインページに移動します...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              {/* Error Message */}
              {error && (
                <div className="bg-rpg-red/20 border-2 border-rpg-red p-3">
                  <div className="flex items-center gap-2 text-rpg-red">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-pixelJp text-xs">{error}</span>
                  </div>
                </div>
              )}

              {/* Display Name Input */}
              <div>
                <label className="flex items-center gap-2 font-pixelJp text-sm text-rpg-textDark mb-2">
                  <User className="w-4 h-4" />
                  表示名（任意）
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-rpg-bgLight border-2 border-rpg-border p-3 font-pixelJp text-sm text-rpg-textDark focus:border-rpg-blue focus:outline-none"
                  placeholder="トレーナー名"
                  disabled={loading}
                />
              </div>

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
                  className="w-full bg-rpg-bgLight border-2 border-rpg-border p-3 font-pixelJp text-sm text-rpg-textDark focus:border-rpg-blue focus:outline-none"
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                />
              </div>

              {/* Password Input */}
              <div>
                <label className="flex items-center gap-2 font-pixelJp text-sm text-rpg-textDark mb-2">
                  <Lock className="w-4 h-4" />
                  パスワード（6文字以上）
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-rpg-bgLight border-2 border-rpg-border p-3 font-pixelJp text-sm text-rpg-textDark focus:border-rpg-blue focus:outline-none"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>

              {/* Terms of Service */}
              <TermsOfService
                isChecked={agreedToTerms}
                onCheckChange={setAgreedToTerms}
              />

              {/* Sign Up Button */}
              <button
                type="submit"
                className="w-full rpg-button rpg-button-primary py-3"
                disabled={loading || !agreedToTerms}
              >
                <span className="font-pixelJp">
                  {loading ? '登録中...' : '登録する'}
                </span>
              </button>

              {/* Conversion helper */}
              <div className="bg-rpg-bgLight border-2 border-rpg-border p-3">
                <p className="font-pixelJp text-xs text-rpg-textDark font-bold mb-1">
                  登録すると使える機能（例）
                </p>
                <ul className="space-y-1 font-pixelJp text-xs text-rpg-textDark opacity-80">
                  <li>・写真の登録が「訪問履歴」としてたまる</li>
                  <li>・あとで一覧/マップで見返せる</li>
                  <li>・公開/非公開の設定ができる</li>
                </ul>
              </div>
            </form>
          )}

          {!success && (
            <div className="mt-6 pt-4 border-t-2 border-rpg-border text-center">
              <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mb-2">
                すでにアカウントをお持ちの方
              </p>
              <Link href="/login" className="rpg-button text-xs">
                <span className="font-pixelJp">ログイン</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
