import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: `プライバシーポリシー | ${SITE_NAME}`,
  description: `${SITE_NAME}（pokefuta.com）のプライバシーポリシーです。取得する情報と利用目的を定めています。`,
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026年8月22日';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 font-pixelJp text-base font-bold text-[#4F3828]">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-[#6A4D36]">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:pt-8">
        <h1 className="font-pixelJp text-2xl font-extrabold text-[#4F3828]">プライバシーポリシー</h1>
        <p className="mt-2 text-xs text-[#8C6A4A]">最終更新: {LAST_UPDATED}</p>

        <p className="mt-6 text-sm leading-relaxed text-[#6A4D36]">
          {SITE_NAME}（pokefuta.com、以下「本サービス」）は、本サービスで取り扱う利用者の情報を次のとおり管理します。
        </p>

        <Section title="1. 取得する情報">
          <ul className="ml-4 list-disc space-y-1">
            <li>アカウント登録に使用するメールアドレス、表示名その他のプロフィール情報</li>
            <li>投稿された写真、キャプション、コメント、訪問記録等</li>
            <li>写真に記録された位置情報、撮影日時、カメラの機種等のEXIF情報</li>
            <li>端末からの位置情報（利用者が許可した場合）</li>
            <li>Cookie、端末・ブラウザの識別子、アクセス日時、参照元、利用環境、操作・エラー等の利用情報</li>
          </ul>
        </Section>

        <Section title="2. 利用目的">
          <ul className="ml-4 list-disc space-y-1">
            <li>アカウントの登録、認証、管理のため</li>
            <li>投稿、訪問記録、スタンプ帳その他の機能を提供するため</li>
            <li>投稿内容の確認、設置場所・分類等の修正について投稿者へ連絡するため</li>
            <li>規約違反、権利侵害、不正利用の防止・調査・対応のため</li>
            <li>重要なお知らせ、問い合わせ対応その他のサービス運営上必要な連絡のため</li>
            <li>利用状況の分析と、機能・安全性の改善のため</li>
          </ul>
          <p>登録されたメールアドレスを、別途同意を得ずに広告・宣伝メールの送信に使用することはありません。</p>
        </Section>

        <Section title="3. 公開される情報">
          <p>
            投稿写真、表示名、キャプション、コメント、訪問日、訪問したマンホール等は、
            本サービス上または運営者のSNS・ブログ等で公開される場合があります。
            メールアドレスと写真のEXIF情報は、公開プロフィールとしては表示しません。
          </p>
        </Section>

        <Section title="4. 外部サービス">
          <p>
            本サービスは、認証・データ保存、画像保存、ホスティング、利用状況の分析のために、
            Supabase、Cloudflare、Amazon Web Services、Google Analytics等の外部サービスを利用することがあります。
            各サービスでは、それぞれのプライバシーポリシーに基づいて情報が取り扱われます。
          </p>
          <p>
            Google AnalyticsはCookie等を使用して利用情報を収集する場合があります。
            利用者は、ブラウザの設定でCookieを無効にすることにより収集を制限できます。
          </p>
        </Section>

        <Section title="5. 第三者への提供">
          <p>
            法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供しません。
            本ポリシーに記載した利用目的の達成に必要な範囲で外部サービスを利用する場合があります。
          </p>
        </Section>

        <Section title="6. 情報の管理と削除">
          <p>
            情報の漏えい、滅失、改ざん、不正アクセス等を防ぐため、合理的な安全管理措置を講じます。
            自分の投稿は本サービスの削除機能から削除できます。その他の情報に関する確認・訂正・削除の依頼は、
            <a
              href="https://x.com/pokemonmanhole"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#bf5640] underline decoration-[#e9dfc7] underline-offset-2"
            >
              @pokemonmanholeのダイレクトメッセージ（非公開）
            </a>
            からお知らせください。GitHub Issues等の公開ページに個人情報を書き込まないでください。
          </p>
        </Section>

        <Section title="7. 本ポリシーの変更">
          <p>本ポリシーを変更する場合は、変更後の内容と更新日を本ページに掲載します。</p>
        </Section>

        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terms" className="text-sm font-bold text-[#bf5640] underline decoration-[#e9dfc7] underline-offset-2">
            利用規約
          </Link>
          <Link href="/about" className="text-sm font-bold text-[#bf5640] underline decoration-[#e9dfc7] underline-offset-2">
            本サービスについて
          </Link>
        </div>
      </main>
    </div>
  );
}
