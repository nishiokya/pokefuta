'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { Terminal, Eye, EyeOff, Copy, Check } from 'lucide-react';

export default function DevDebugPanel() {
  // 本番環境では表示しない
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [copied, setCopied] = useState(false);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [appUserExists, setAppUserExists] = useState<boolean | null>(null);
  const [appUserError, setAppUserError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const supabase = createBrowserClient();

      // 認証状態の監視
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);

        // app_userテーブルの存在確認
        if (session?.user) {
          checkAppUser(supabase, session.user.id);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);

        // app_userテーブルの存在確認
        if (session?.user) {
          checkAppUser(supabase, session.user.id);
        }
      });

      return () => subscription.unsubscribe();
    } catch (error: any) {
      setSupabaseError(error.message);
    }
  }, []);

  // app_userテーブルの存在確認
  const checkAppUser = async (supabase: any, userId: string) => {
    try {
      const { data, error } = await supabase
        .from('app_user')
        .select('auth_uid, display_name')
        .eq('auth_uid', userId)
        .single();

      if (error) {
        console.error('app_user確認エラー:', error);
        setAppUserExists(false);
        setAppUserError(error.message);
      } else if (data) {
        console.log('✅ app_userレコード存在:', data);
        setAppUserExists(true);
        setAppUserError(null);
      } else {
        setAppUserExists(false);
        setAppUserError('レコードが見つかりません');
      }
    } catch (err: any) {
      console.error('app_user確認失敗:', err);
      setAppUserExists(false);
      setAppUserError(err.message);
    }
  };

  const envVars = {
    'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?
      `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}...` : 'undefined',
    'NODE_ENV': process.env.NODE_ENV,
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const testLoginCredentials = {
    email: 'test@example.com',
    password: 'test123456',
    note: '※テスト用アカウント（開発時のみ表示）'
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-4 z-50 rpg-button rpg-button-primary p-3 shadow-rpg"
        title="デバッグパネル"
      >
        <Terminal className="w-5 h-5" />
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-32 right-4 z-50 w-96 max-h-96 overflow-auto rpg-window animate-slide-in">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#7B63A8]/15">
            <h3 className="font-pixelJp text-sm text-rpg-yellow font-bold">🐛 開発デバッグ</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-rpg-textDark hover:text-rpg-red"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>

          {/* Supabase Error */}
          {supabaseError && (
            <div className="mb-3 p-2 bg-rpg-red/20 border-2 border-rpg-red">
              <p className="font-pixelJp text-xs text-rpg-red font-bold mb-1">❌ Supabaseエラー</p>
              <p className="font-pixelJp text-xs text-rpg-textDark">{supabaseError}</p>
            </div>
          )}

          {/* Auth Status */}
          <div className="mb-3 p-2 bg-white/70 border border-[#7B63A8]/15">
            <p className="font-pixelJp text-xs text-rpg-textDark font-bold mb-2">
              認証状態: {user ? '✅ ログイン中' : '❌ 未ログイン'}
            </p>
            {user ? (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-pixelJp text-rpg-textDark opacity-70">ID:</span>
                  <span className="font-pixel text-[10px] text-rpg-textDark">{user.id.substring(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-pixelJp text-rpg-textDark opacity-70">Email:</span>
                  <span className="font-pixelJp text-rpg-textDark">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-pixelJp text-rpg-textDark opacity-70">表示名:</span>
                  <span className="font-pixelJp text-rpg-textDark">
                    {user.user_metadata?.display_name || 'なし'}
                  </span>
                </div>

                {/* app_user テーブル状態 */}
                <div className="mt-2 pt-2 border-t border-rpg-border">
                  <div className="flex items-center justify-between">
                    <span className="font-pixelJp text-rpg-textDark opacity-70">app_user:</span>
                    {appUserExists === null ? (
                      <span className="font-pixelJp text-rpg-textDark">確認中...</span>
                    ) : appUserExists ? (
                      <span className="font-pixelJp text-rpg-green">✅ 存在</span>
                    ) : (
                      <span className="font-pixelJp text-rpg-red">❌ 未作成</span>
                    )}
                  </div>
                  {appUserError && (
                    <div className="mt-1 p-1 bg-rpg-red/20 border border-rpg-red">
                      <p className="font-pixelJp text-[10px] text-rpg-red">{appUserError}</p>
                    </div>
                  )}
                  {!appUserExists && appUserExists !== null && (
                    <div className="mt-1 p-1 bg-rpg-yellow/20 border border-rpg-yellow">
                      <p className="font-pixelJp text-[10px] text-rpg-textDark">
                        ⚠️ app_userテーブルにレコードがありません。
                        サインアップ時にエラーが発生した可能性があります。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-pixelJp text-xs text-rpg-textDark">
                  テストアカウントでログインしてください
                </p>
                <div className="bg-rpg-yellow/20 border border-rpg-yellow p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-pixelJp text-xs text-rpg-textDark">Email:</span>
                    <button
                      onClick={() => copyToClipboard(testLoginCredentials.email)}
                      className="flex items-center gap-1 hover:opacity-70"
                    >
                      <span className="font-pixel text-[10px] text-rpg-textDark">{testLoginCredentials.email}</span>
                      {copied ? <Check className="w-3 h-3 text-rpg-green" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-pixelJp text-xs text-rpg-textDark">Pass:</span>
                    <button
                      onClick={() => copyToClipboard(testLoginCredentials.password)}
                      className="flex items-center gap-1 hover:opacity-70"
                    >
                      <span className="font-pixel text-[10px] text-rpg-textDark">{testLoginCredentials.password}</span>
                      {copied ? <Check className="w-3 h-3 text-rpg-green" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="font-pixelJp text-[10px] text-rpg-textDark opacity-70 mt-1">
                    {testLoginCredentials.note}
                  </p>
                </div>
                <a
                  href="/login"
                  className="block text-center rpg-button rpg-button-primary text-xs py-1"
                >
                  <span className="font-pixelJp">ログインページへ</span>
                </a>
              </div>
            )}
          </div>

          {/* Environment Variables */}
          <div className="mb-3 p-2 bg-white/70 border border-[#7B63A8]/15">
            <p className="font-pixelJp text-xs text-rpg-textDark font-bold mb-2">環境変数</p>
            <div className="space-y-1">
              {Object.entries(envVars).map(([key, value]) => (
                <div key={key} className="flex justify-between text-[10px]">
                  <span className="font-pixelJp text-rpg-textDark opacity-70">{key}:</span>
                  <span className={`font-pixel ${value && value !== 'undefined' ? 'text-rpg-green' : 'text-rpg-red'}`}>
                    {value || '❌ 未設定'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="mb-3 p-2 bg-rpg-yellow/10 border-2 border-rpg-yellow">
            <p className="font-pixelJp text-xs text-rpg-textDark font-bold mb-2">🔍 トラブルシューティング</p>
            <div className="space-y-1 text-[10px] font-pixelJp text-rpg-textDark">
              <p>• ログインに失敗する場合:</p>
              <p className="ml-2">1. メールアドレス・パスワードを確認</p>
              <p className="ml-2">2. Supabaseでメール確認が無効か確認</p>
              <p className="ml-2">3. ブラウザのコンソールでエラー確認</p>
              <p className="ml-2">4. app_userレコードが作成されているか確認</p>
              <br/>
              <p>• Supabase設定確認:</p>
              <p className="ml-2">Authentication → Providers → Email</p>
              <p className="ml-2">「Confirm email」を OFF にする</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            <a href="/login" className="block text-center rpg-button text-xs py-1">
              <span className="font-pixelJp">新規登録</span>
            </a>
            <a href="/login" className="block text-center rpg-button rpg-button-primary text-xs py-1">
              <span className="font-pixelJp">ログイン</span>
            </a>
            {user && (
              <button
                onClick={async () => {
                  try {
                    const supabase = createBrowserClient();
                    await supabase.auth.signOut();
                    window.location.reload();
                  } catch (error) {
                    console.error('Logout error:', error);
                  }
                }}
                className="w-full rpg-button text-xs py-1 text-rpg-red"
              >
                <span className="font-pixelJp">ログアウト</span>
              </button>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-[#7B63A8]/15">
            <p className="font-pixelJp text-[10px] text-rpg-textDark opacity-50 text-center">
              本番環境では自動的に非表示
            </p>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .animate-slide-in {
          animation: slide-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
