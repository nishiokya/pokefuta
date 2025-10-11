'use client';

import { AlertCircle } from 'lucide-react';

interface SupabaseErrorBoundaryProps {
  error?: string | null;
  children: React.ReactNode;
}

export default function SupabaseErrorBoundary({ error, children }: SupabaseErrorBoundaryProps) {
  if (error) {
    return (
      <div className="min-h-screen safe-area-inset bg-rpg-bgDark flex items-center justify-center p-4">
        <div className="rpg-window max-w-2xl">
          <div className="flex items-start gap-4 mb-4">
            <AlertCircle className="w-12 h-12 text-rpg-red flex-shrink-0" />
            <div>
              <h1 className="font-pixelJp text-lg text-rpg-red mb-2">
                ⚠️ Supabase設定エラー
              </h1>
              <p className="font-pixelJp text-sm text-rpg-textDark mb-4">
                Supabaseの設定が正しくありません。
              </p>
            </div>
          </div>

          <div className="bg-rpg-bgLight border-2 border-rpg-border p-4 mb-4">
            <pre className="font-pixelJp text-xs text-rpg-textDark whitespace-pre-wrap overflow-auto">
              {error}
            </pre>
          </div>

          <div className="space-y-3">
            <div className="font-pixelJp text-sm text-rpg-textDark">
              <p className="font-bold mb-2">✅ 修正手順:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>プロジェクトルートの <code className="bg-rpg-yellow px-1">.env.local</code> ファイルを開く</li>
                <li>以下の環境変数を設定:
                  <div className="bg-rpg-bgDark p-2 mt-1 border border-rpg-border text-xs">
                    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url<br/>
                    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
                  </div>
                </li>
                <li>Supabaseダッシュボード (<a href="https://supabase.com/dashboard" target="_blank" className="text-rpg-blue underline">https://supabase.com/dashboard</a>) から値を取得</li>
                <li>開発サーバーを再起動</li>
              </ol>
            </div>

            <div className="pt-3 border-t-2 border-rpg-border">
              <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                📚 詳細: CLAUDE.md を参照してください
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
