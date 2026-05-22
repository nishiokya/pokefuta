'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Camera, CheckCircle, Lock, Mail, Map, Shield, Stamp, User, UserPlus } from 'lucide-react';
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
  const { trackSignupStart, trackSignupComplete, trackAuthError, setUser } = useAnalytics();

  // ページタイトル設定
  useEffect(() => {
    document.title = '新規登録 - ポケふた訪問記録';
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    trackSignupStart();

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

        setUser(data.user.id);
        trackSignupComplete();

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

  const benefitItems = [
    {
      icon: <Stamp className="h-5 w-5" />,
      title: '自分だけのスタンプ帳',
      description: '訪問済みのポケふたを集めて、全国制覇率を確認できます',
    },
    {
      icon: <Camera className="h-5 w-5" />,
      title: '写真を旅の記録に',
      description: '撮影した写真を投稿して、あとから思い出を見返せます',
    },
    {
      icon: <Map className="h-5 w-5" />,
      title: '次に行く場所を探す',
      description: '都道府県別の進捗や未訪問候補から次の目的地を見つけられます',
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
                <UserPlus className="h-3.5 w-3.5" />
                旅をはじめる
              </div>

              <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
                スタンプ帳を作成
              </h1>
              <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-[#6A4D36] sm:text-base">
                メールアドレスで無料登録すると、訪問履歴・写真投稿・都道府県別の進捗を保存できます。
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
            </div>

            <div className="border-t border-[#8C6A4A]/15 bg-[#FFF8EB]/80 p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              {success ? (
                <div className="rounded-[8px] border border-[#2D846C]/25 bg-white/75 px-5 py-8 text-center">
                  <CheckCircle className="mx-auto mb-4 h-14 w-14 text-[#2D846C]" />
                  <h2 className="text-xl font-extrabold text-[#2D846C]">登録完了!</h2>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-[#6A4D36]">
                    確認メールを送信しました。ログインページに移動します...
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 rounded-[8px] border border-[#7B63A8]/20 bg-white/70 p-3">
                    <div className="flex items-start gap-2">
                      <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7B63A8]" />
                      <p className="text-xs font-bold leading-relaxed text-[#6A4D36]">
                        写真や位置情報を扱うため、登録後にメール確認が必要です。
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSignUp} className="space-y-4">
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
                        <User className="h-4 w-4" />
                        表示名（任意）
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full rounded-[8px] border border-[#8C6A4A]/20 bg-white/80 p-3 text-sm font-medium text-[#2A2A2A] outline-none transition focus:border-[#7B63A8] focus:ring-2 focus:ring-[#7B63A8]/15"
                        placeholder="トレーナー名"
                        disabled={loading}
                      />
                    </div>

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
                        パスワード（6文字以上）
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

                    <TermsOfService
                      isChecked={agreedToTerms}
                      onCheckChange={setAgreedToTerms}
                      className="rounded-[8px] border-[#8C6A4A]/20"
                    />

                    <button
                      type="submit"
                      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299] disabled:opacity-60"
                      disabled={loading || !agreedToTerms}
                    >
                      <UserPlus className="h-4 w-4" />
                      <span>{loading ? '登録中...' : '無料でスタンプ帳をはじめる'}</span>
                    </button>
                  </form>

                  <div className="mt-6 border-t border-[#8C6A4A]/15 pt-4 text-center">
                    <p className="mb-2 text-xs font-medium text-[#6A4D36]">
                      すでにアカウントをお持ちの方
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-lg border border-[#7B63A8] bg-white px-4 py-2 text-xs font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#7B63A8]/5"
                    >
                      旅の続きへログイン
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
