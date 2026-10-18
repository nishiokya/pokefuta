import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { HelpShell, Section, Steps } from '../HelpParts';

export const metadata: Metadata = {
  title: `iPhone の写真を投稿する | ${SITE_NAME}`,
  description:
    'iPhone で撮ったポケふたの写真を、位置情報を残したまままとめて投稿する方法です。iPhone から直接投稿する方法と、Google フォト経由で PC から投稿する方法を説明します。',
  alternates: { canonical: `${SITE_URL}/help/iphone-photos` },
  robots: { index: true, follow: true },
};

export default function IphonePhotosHelpPage() {
  return (
    <HelpShell
      title="iPhone の写真を投稿する"
      current="/help/iphone-photos"
      lead={<p>iPhone の写真は、iPhone からそのまま投稿できます。Google フォトにバックアップしていれば、PC から投稿することもできます。</p>}
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

      <Section title="PC から投稿する">
        <Steps>
          <li>iPhone の Google フォトでバックアップを ON にし、写真がバックアップされるのを待ちます</li>
          <li>
            PC のブラウザで <span className="font-bold">photos.google.com</span> を開き、iPhone と同じ Google アカウントでログインします
          </li>
          <li>投稿したい写真を選び、右上の「︙」から「ダウンロード」を選びます（複数枚は zip で保存されるので展開します）</li>
          <li>
            <Link href="/upload/bulk" className="font-bold underline">まとめて投稿</Link> を開き、写真かフォルダをドラッグ＆ドロップします
          </li>
        </Steps>
        <p>Google フォトのウェブ版から落とした写真は、位置情報が残ります。場所に「推定」と出ている写真は位置情報が無いので投稿できません。</p>
      </Section>

      <Section title="HEIC の写真が送れないとき" id="heic">
        <p>
          PC のブラウザは HEIC 形式の写真を開けないことがあり、「この画像形式は変換できませんでした」と出ます。次のどれかを試してください。
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>iPhone から直接まとめて投稿する</li>
          <li>Mac なら Safari でまとめて投稿を開く</li>
          <li>これから撮る写真は、「設定」→「カメラ」→「フォーマット」を「互換性優先」にする（JPEG で撮れます）</li>
        </ul>
      </Section>
    </HelpShell>
  );
}
