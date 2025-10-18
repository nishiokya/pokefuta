'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocsPage() {
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // クライアントサイドで環境をチェック
    const checkEnvironment = async () => {
      try {
        const response = await fetch('/api/swagger');
        setIsDevelopment(response.ok);
      } catch (error) {
        setIsDevelopment(false);
      } finally {
        setLoading(false);
      }
    };

    checkEnvironment();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-rpg-bgDark flex items-center justify-center">
        <div className="text-center">
          <div className="font-pixelJp text-rpg-textGold">
            読み込み中<span className="rpg-loading"></span>
          </div>
        </div>
      </div>
    );
  }

  if (!isDevelopment) {
    return (
      <div className="min-h-screen bg-rpg-bgDark flex items-center justify-center p-4">
        <div className="rpg-window max-w-md text-center">
          <h1 className="rpg-window-title text-base mb-4">
            ⚠️ アクセス制限
          </h1>
          <p className="font-pixelJp text-sm text-rpg-textDark mb-4">
            APIドキュメントは開発環境でのみ利用可能です。
          </p>
          <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mb-6">
            本番環境ではセキュリティ上の理由により無効化されています。
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="rpg-button rpg-button-primary"
          >
            <span className="font-pixelJp text-xs">ホームに戻る</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-rpg-bgDark border-b-4 border-rpg-border p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-pixelJp text-xl text-rpg-yellow" style={{
            textShadow: '2px 2px 0 #34495E'
          }}>
            📖 Pokefuta API ドキュメント
          </h1>
          <p className="font-pixelJp text-sm text-rpg-textGold mt-2">
            ポケふた写真管理アプリのAPI仕様書 (開発環境)
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <SwaggerUI url="/api/swagger" />
      </div>
    </div>
  );
}
