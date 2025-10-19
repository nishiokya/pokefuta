'use client';

import { Info, Camera, Map, Navigation, History, Shield, MessageSquare, UserPlus, Github, Twitter } from 'lucide-react';
import Header from '@/components/Header';

export default function AboutPage() {
  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark pb-20">
      <Header title="このアプリについて" icon={<Info className="w-6 h-6 text-rpg-yellow" />} />

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* アプリの説明 */}
        <section className="rpg-window">
          <h2 className="rpg-window-title">ポケふたフォトトラッカー</h2>
          <div className="space-y-3">
            <p className="font-pixelJp text-sm text-rpg-textDark leading-relaxed">
              全国各地に設置されているポケモンマンホール「ポケふた」の訪問記録を管理できるアプリです。
            </p>
            <p className="font-pixelJp text-sm text-rpg-textDark leading-relaxed">
              写真を撮影して記録を残し、訪問履歴を振り返ることができます。
            </p>
          </div>
        </section>

        {/* 使い方 */}
        <section className="rpg-window">
          <h2 className="rpg-window-title">使い方</h2>
          <div className="space-y-4">
            {/* 0. アカウント作成 */}
            <div className="bg-rpg-bgLight p-4 border-2 border-rpg-border">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-rpg-textDark" />
                </div>
                <div className="flex-1">
                  <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                    1. アカウント作成・ログイン
                  </h3>
                  <p className="font-pixelJp text-xs text-rpg-textDark leading-relaxed">
                    メールアドレスまたはGoogleアカウントで無料登録できます。登録後、訪問記録の保存や写真のアップロードが可能になります。
                  </p>
                </div>
              </div>
            </div>

            {/* 1. 写真を登録 */}
            <div className="bg-rpg-bgLight p-4 border-2 border-rpg-border">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                  <Camera className="w-5 h-5 text-rpg-textDark" />
                </div>
                <div className="flex-1">
                  <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                    2. 写真を登録
                  </h3>
                  <p className="font-pixelJp text-xs text-rpg-textDark leading-relaxed">
                    「写真を登録」から撮影したポケふたの写真をアップロードできます。撮影日時や位置情報、メモを記録できます。
                  </p>
                </div>
              </div>
            </div>

            {/* 2. マンホールを探す */}
            <div className="bg-rpg-bgLight p-4 border-2 border-rpg-border">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                  <Map className="w-5 h-5 text-rpg-textDark" />
                </div>
                <div className="flex-1">
                  <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                    3. マンホールを探す
                  </h3>
                  <p className="font-pixelJp text-xs text-rpg-textDark leading-relaxed">
                    「マンホール一覧」で全国のポケふた設置場所を確認できます。都道府県別に検索して、訪問したい場所を見つけましょう。
                  </p>
                </div>
              </div>
            </div>

            {/* 3. 近くの未訪問を探す */}
            <div className="bg-rpg-bgLight p-4 border-2 border-rpg-border">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-rpg-textDark" />
                </div>
                <div className="flex-1">
                  <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                    4. 近くの未訪問を探す
                  </h3>
                  <p className="font-pixelJp text-xs text-rpg-textDark leading-relaxed">
                    現在地から近い、まだ訪問していないポケふたを地図で確認できます。旅行や散策の計画に便利です。
                  </p>
                </div>
              </div>
            </div>

            {/* 4. 訪問履歴を見る */}
            <div className="bg-rpg-bgLight p-4 border-2 border-rpg-border">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                  <History className="w-5 h-5 text-rpg-textDark" />
                </div>
                <div className="flex-1">
                  <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                    5. 訪問履歴を見る
                  </h3>
                  <p className="font-pixelJp text-xs text-rpg-textDark leading-relaxed">
                    「訪問履歴」で今までに訪問したポケふたの記録を振り返ることができます。写真と一緒に思い出を保存できます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* プライバシーとセキュリティ */}
        <section className="rpg-window">
          <h2 className="rpg-window-title flex items-center gap-2">
            <Shield className="w-5 h-5" />
            プライバシーとセキュリティ
          </h2>
          <div className="space-y-3">
            <div>
              <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                データの管理
              </h3>
              <ul className="font-pixelJp text-xs text-rpg-textDark leading-relaxed space-y-1 pl-4">
                <li>• あなたの訪問記録と写真は安全に保存されます</li>
                <li>• 訪問記録は個人のアカウントに紐づき、他のユーザーには表示されません</li>
                <li>• アップロードした写真は暗号化されて保存されます</li>
              </ul>
            </div>
            <div>
              <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                位置情報
              </h3>
              <ul className="font-pixelJp text-xs text-rpg-textDark leading-relaxed space-y-1 pl-4">
                <li>• 位置情報は撮影場所の記録にのみ使用されます</li>
                <li>• 位置情報の利用は任意で、許可しなくても基本機能は利用できます</li>
                <li>• 位置情報は第三者に共有されません</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 免責事項 */}
        <section className="rpg-window">
          <h2 className="rpg-window-title">免責事項</h2>
          <div className="space-y-3 font-pixelJp text-xs text-rpg-textDark leading-relaxed">
            <p>
              本アプリは個人が開発した非公式アプリです。
            </p>
            <p>
              本アプリの利用により生じたいかなる損害についても、開発者は責任を負いかねます。
            </p>
            <p>
              マンホール情報は公開情報を基に作成していますが、正確性を保証するものではありません。訪問前に最新情報をご確認ください。
            </p>
            <p>
              ポケふたを訪問する際は、周囲の安全に配慮し、交通ルールを守ってください。
            </p>
          </div>
        </section>

        {/* フィードバック */}
        <section className="rpg-window">
          <h2 className="rpg-window-title flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-rpg-blue" />
            フィードバック
          </h2>
          <div className="space-y-4">
            <p className="font-pixelJp text-sm text-rpg-textDark leading-relaxed">
              バグ報告や機能要望、ご意見・ご感想をお待ちしています！
            </p>

            {/* GitHub Issues */}
            <div className="bg-rpg-bgLight p-4 border-2 border-rpg-border">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-rpg-textDark border-2 border-rpg-border flex items-center justify-center">
                  <Github className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                    GitHub Issues
                  </h3>
                  <p className="font-pixelJp text-xs text-rpg-textDark leading-relaxed mb-3">
                    バグ報告や機能要望はこちらからお願いします
                  </p>
                  <a
                    href="https://github.com/nishiokya/pokefuta-tracker/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rpg-button rpg-button-primary inline-flex items-center gap-2 text-xs"
                  >
                    <Github className="w-4 h-4" />
                    <span className="font-pixelJp">Issues を開く</span>
                  </a>
                </div>
              </div>
            </div>

            {/* X (Twitter) */}
            <div className="bg-rpg-bgLight p-4 border-2 border-rpg-border">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-rpg-textDark border-2 border-rpg-border flex items-center justify-center">
                  <Twitter className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                    X (Twitter)
                  </h3>
                  <p className="font-pixelJp text-xs text-rpg-textDark leading-relaxed mb-3">
                    アプリの更新情報やお知らせを発信しています
                  </p>
                  <a
                    href="https://x.com/pokemonmanhole"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rpg-button rpg-button-primary inline-flex items-center gap-2 text-xs"
                  >
                    <Twitter className="w-4 h-4" />
                    <span className="font-pixelJp">@pokemonmanhole をフォロー</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* バージョン情報 */}
        <section className="rpg-window bg-rpg-bgLight">
          <div className="text-center font-pixelJp text-xs text-rpg-textDark opacity-50">
            Version 1.0.0
          </div>
        </section>
      </main>
    </div>
  );
}
