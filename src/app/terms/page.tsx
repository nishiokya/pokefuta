import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';

// 規約ページは検索資産ではないが、リンク先として安定していることが要件。
// UGC を消す根拠になる文書なので、404 や noindex で消えられると困る。
export const metadata: Metadata = {
  title: `利用規約 | ${SITE_NAME}`,
  description: `${SITE_NAME}（pokefuta.com）の利用規約です。投稿された写真・コメントの取り扱いと、削除の基準を定めています。`,
  alternates: { canonical: `${SITE_URL}/terms` },
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

export default function TermsPage() {
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:pt-8">
        <h1 className="font-pixelJp text-2xl font-extrabold text-[#4F3828]">利用規約</h1>
        <p className="mt-2 text-xs text-[#8C6A4A]">最終更新: {LAST_UPDATED}</p>

        <p className="mt-6 text-sm leading-relaxed text-[#6A4D36]">
          本規約は、{SITE_NAME}（pokefuta.com、以下「本サービス」）の利用条件を定めるものです。
          本サービスを利用された方は、本規約に同意したものとみなします。
        </p>

        <Section title="1. 本サービスについて">
          <p>
            本サービスは、全国のポケふた（ポケモンマンホール）を探し、訪問の記録と写真を残し、
            同じ場所を訪れた人どうしがコメントで情報を交換するための個人運営のサービスです。
          </p>
          <p>
            本サービスは株式会社ポケモンおよび関連企業とは一切関係のない非公式のサービスです。
            ポケモンおよびポケふたに関する権利は、それぞれの権利者に帰属します。
          </p>
        </Section>

        <Section title="2. 投稿について">
          <p>
            利用者は、本サービスに写真・キャプション・コメント（以下「投稿」）を投稿できます。
            投稿の内容についての責任は、投稿した利用者本人が負うものとします。
          </p>
          <p>
            投稿にあたっては、著作権・肖像権・その他の第三者の権利を侵害しないでください。
            他人が写り込んだ写真を公開する場合は、その人の了解を得てください。
          </p>
          <p>
            利用者は、本サービスの運営・表示・紹介に必要な範囲で、投稿を利用することを許諾するものとします。
            これには、運営者のSNSやブログ等で投稿を紹介することが含まれます。
            投稿の権利は投稿者に残ります。
          </p>
        </Section>

        <Section title="3. 禁止事項">
          <p>次の投稿・行為を禁止します。</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>法令または公序良俗に反するもの</li>
            <li>特定の個人・団体を誹謗中傷するもの、差別的なもの、嫌がらせにあたるもの</li>
            <li>第三者の権利（著作権・肖像権・プライバシー等）を侵害するもの</li>
            <li>本人の同意なく、他人の個人情報や連絡先を掲載するもの</li>
            <li>宣伝・勧誘・スパムを目的とするもの、および同種の投稿の大量送信</li>
            <li>ポケふたの設置場所や周辺の住民・店舗に迷惑をかける行為を助長するもの</li>
            <li>本サービスの運営を妨害する行為、不正アクセス、自動化された大量の要求</li>
          </ul>
        </Section>

        <Section title="4. 投稿の削除">
          <p>
            利用者は、自分の投稿をいつでも自分で削除できます。
          </p>
          <p>
            運営者は、次の場合に、事前の通知なく投稿を削除し、または利用者のアカウントの利用を停止することがあります。
            削除の判断について、運営者は個別の説明の義務を負いません。
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>第3項の禁止事項に該当すると運営者が判断した場合</li>
            <li>他の利用者からの通報を受け、対応が必要と運営者が判断した場合</li>
            <li>権利者から削除の申し出があった場合</li>
            <li>その他、本サービスの運営上必要と運営者が判断した場合</li>
          </ul>
          <p>
            問題のある投稿を見つけた場合は、各コメントの「通報」から知らせてください。
            通報の内容は運営者のみが確認します。通報したことが相手に伝わることはありません。
          </p>
        </Section>

        <Section title="5. 運営者からの連絡">
          <p>
            運営者は、アカウントの管理、投稿内容の確認・修正、規約違反または不正利用の調査、
            その他本サービスの運営上必要なご案内のために、登録されたメールアドレスへ連絡することがあります。
          </p>
          <p>
            登録されたメールアドレスを、別途同意を得ずに広告・宣伝メールの送信に使用することはありません。
          </p>
        </Section>

        <Section title="6. 免責">
          <p>
            本サービスは個人が運営しており、内容の正確性・完全性・可用性を保証しません。
            掲載しているポケふたの設置場所・状態は変わることがあります。現地の情報を優先してください。
          </p>
          <p>
            本サービスの利用、または利用できなかったことによって生じた損害について、
            運営者は責任を負いません。予告なくサービスの内容を変更・中断・終了することがあります。
          </p>
        </Section>

        <Section title="7. 規約の変更">
          <p>
            運営者は本規約を変更することがあります。変更後の規約は本ページに掲載した時点で効力を生じます。
          </p>
        </Section>

        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2">
          <Link
            href="/privacy"
            className="text-sm font-bold text-[#bf5640] underline decoration-[#e9dfc7] underline-offset-2"
          >
            プライバシーポリシー
          </Link>
          <Link
            href="/about"
            className="text-sm font-bold text-[#bf5640] underline decoration-[#e9dfc7] underline-offset-2"
          >
            本サービスについて
          </Link>
        </div>
      </main>
    </div>
  );
}
