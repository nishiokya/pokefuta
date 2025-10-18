'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import TermsOfService from '@/components/TermsOfService';

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

        // app_userテーブルにプロフィール作成
        try {
          console.log('📝 app_userテーブルにプロフィールを作成中...', {
            auth_uid: data.user.id,
            email: email,
            display_name: displayName || email.split('@')[0],
          });

          const { data: profileData, error: profileError } = await supabase
            .from('app_user')
            .insert({
              auth_uid: data.user.id,
              email: email,
              display_name: displayName || email.split('@')[0],
            })
            .select()
            .single();

          if (profileError) {
            console.error('❌ app_userテーブルへの挿入エラー:', {
              code: profileError.code,
              message: profileError.message,
              details: profileError.details,
              hint: profileError.hint,
            });

            // エラーをユーザーに表示
            setError(
              `プロフィール作成エラー: ${profileError.message}\n\n` +
              `ヒント: ${profileError.hint || 'app_userテーブルが存在するか、RLSポリシーが正しく設定されているか確認してください'}`
            );
            return;
          }

          console.log('✅ app_userプロフィール作成成功:', profileData);
        } catch (profileErr: any) {
          console.error('❌ プロフィール作成で予期しないエラー:', profileErr);
          setError(`プロフィール作成失敗: ${profileErr.message || '不明なエラー'}`);
          return;
        }

        setSuccess(true);

        // 2秒後にログインページへリダイレクト
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(err.message || '登録に失敗しました');
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
            <div className="w-20 h-20 bg-rpg-blue border-4 border-rpg-border flex items-center justify-center mx-auto">
              <UserPlus className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="font-pixelJp text-2xl text-rpg-blue mb-2" style={{
            textShadow: '3px 3px 0 #34495E'
          }}>
            新規登録
          </h1>
          <p className="font-pixelJp text-sm text-rpg-textDark opacity-70">
            冒険を始めるためにアカウントを作成
          </p>
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
