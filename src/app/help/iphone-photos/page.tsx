import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { HelpShell, Section, Steps } from '../HelpParts';

export const metadata: Metadata = {
  title: `iPhone の写真を投稿する | ${SITE_NAME}`,
  description:
    'iPhone で撮ったポケふたの写真を、位置情報を残したまままとめて投稿する方法です。iPhone から直接投稿する方法と、Mac・Windows に移して投稿する方法を説明します。',
  alternates: { canonical: `${SITE_URL}/help/iphone-photos` },
  robots: { index: true, follow: true },
};

export default function IphonePhotosHelpPage() {
  return (
    <HelpShell
      title="iPhone の写真を投稿する"
      current="/help/iphone-photos"
      lead={<p>iPhone の写真は、iPhone からそのまま投稿できます。たくさんあるときは、PC に移して投稿することもできます。</p>}
    >
      <Section title="撮る前に: カメラの位置情報を ON にする">
        <p>
          「設定」→「プライバシーとセキュリティ」→「位置情報サービス」→「カメラ」で、「このAppの使用中」を選んでください。
          OFF のまま撮った写真には位置情報が入らず、投稿できません。
        </p>
      </Section>

      <Section title="iPhone から直接まとめて投稿する">
        <Steps>
          <li>
            Safari か Chrome で <Link href="/upload/bulk" className="font-bold underline">まとめて投稿</Link> を開きます
          </li>
          <li>「写真を選ぶ」を押し、「フォトライブラリ」から投稿したい写真を選びます</li>
          <li>写真選択の画面に「オプション」がある場合は、開いて「位置情報」が ON になっているか確かめます（OFF だと位置情報が消えます）</li>
          <li>「追加」を押すと、写真の振り分けが始まります</li>
        </Steps>
      </Section>

      <Section title="Mac に移して投稿する">
        <Steps>
          <li>Mac の「写真」App で、投稿したい写真を選びます</li>
          <li>「ファイル」→「書き出す」→「未編集のオリジナルを書き出す」で、フォルダに書き出します</li>
          <li>
            Safari で <Link href="/upload/bulk" className="font-bold underline">まとめて投稿</Link> を開き、書き出したフォルダをドラッグ＆ドロップします
          </li>
        </Steps>
        <p>iPhone の写真は HEIC 形式のことが多く、Mac の Chrome では開けないことがあります。Mac では Safari を使ってください。</p>
      </Section>

      <Section title="Windows に移して投稿する">
        <Steps>
          <li>iPhone と PC を USB ケーブルでつなぎ、iPhone に出る「このコンピュータを信頼しますか？」で「信頼」を選びます</li>
          <li>エクスプローラーで「Apple iPhone」→「Internal Storage」→「DCIM」を開き、写真を PC のフォルダにコピーします</li>
          <li>
            PC のブラウザで <Link href="/upload/bulk" className="font-bold underline">まとめて投稿</Link> を開き、コピーしたフォルダをドラッグ＆ドロップします
          </li>
        </Steps>
        <p>
          Google フォトにバックアップしている場合は、PC で photos.google.com からダウンロードした写真も使えます（位置情報は残ります）。
        </p>
      </Section>

      <Section title="HEIC の写真が送れないとき" id="heic">
        <p>
          Windows のブラウザは HEIC 形式の写真を開けないことがあり、「この画像形式は変換できませんでした」と出ます。次のどちらかで JPEG にしてください。
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>PC に移す前に、iPhone の「設定」→「写真」→「MacまたはPCに転送」を「自動」にする（USB でコピーするとき JPEG になります）</li>
          <li>これから撮る写真は、「設定」→「カメラ」→「フォーマット」を「互換性優先」にする（JPEG で撮れます）</li>
        </ul>
      </Section>
    </HelpShell>
  );
}
