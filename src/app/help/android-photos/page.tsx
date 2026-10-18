import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { HelpShell, Section, Steps } from '../HelpParts';

// Android のスマホでは、撮ってある写真をブラウザで選ぶと位置情報（EXIF の GPS）が消える。
// 2026-10 に実機で、accept の書き方・選ぶアプリ（標準の写真選択・Google フォト・ファイル）を変えても
// 全部消え、カメラで撮る形だけ届くと確かめた。なので撮ってある写真は PC に移して /upload/bulk から投稿してもらう。

export const metadata: Metadata = {
  title: `Android の写真を PC に移して投稿する | ${SITE_NAME}`,
  description:
    'Android のスマホで撮ったポケふたの写真を、位置情報を残したまま PC に移し、まとめて投稿する方法です。Google フォトのウェブ版からダウンロードする方法を説明します。',
  alternates: { canonical: `${SITE_URL}/help/android-photos` },
  robots: { index: true, follow: true },
};

export default function AndroidPhotosHelpPage() {
  return (
    <HelpShell title="Android の写真を PC に移して投稿する" current="/help/android-photos">

        <div className="mt-6 rounded-xl border border-[#B07818]/30 bg-[#FAF0DC] p-4 text-sm leading-relaxed text-[#5C4410]">
          <p>
            Android のスマホでは、撮ってある写真をブラウザで選ぶと<strong>位置情報が消えてしまい</strong>、
            どの蓋の写真か分からないため投稿できません。
          </p>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li>
              蓋の前にいるなら、<Link href="/upload" className="font-bold underline">投稿画面</Link>の「カメラで撮影」でその場で撮って投稿できます
            </li>
            <li>撮ってある写真は、Google フォトのウェブ版から PC にダウンロードして、PC の「まとめて投稿」から投稿してください</li>
          </ul>
        </div>

        <Section title="撮る前に: カメラの位置情報を ON にする">
          <p>
            写真に位置情報が入っていないと、PC に移しても投稿できません。カメラアプリの設定で、位置情報を写真に記録する設定を ON にしてください。
            名前は機種によって違い、「位置タグ」「位置情報を保存」などと書かれています。
          </p>
          <p>
            撮った写真に位置情報が入っているかは、Google フォトで写真を開き「情報」で確かめられます。
            場所の下に<strong>「推定」</strong>と出ている写真は、Google が後から推定した場所で、写真そのものには位置情報が入っていません。
          </p>
        </Section>

        <Section title="Google フォトのウェブ版からダウンロードする（Windows・Mac）">
          <Steps>
            <li>スマホの Google フォトでバックアップを ON にし、写真がバックアップされるのを待ちます</li>
            <li>
              PC のブラウザで <span className="font-bold">photos.google.com</span> を開き、スマホと同じ Google アカウントでログインします
            </li>
            <li>投稿したい写真を選びます（写真の左上の丸をクリック。Shift キーを押しながらで範囲を選べます）</li>
            <li>右上の「︙」から「ダウンロード」を選びます（Shift + D でも同じ）。複数枚は zip ファイルで保存されるので、展開します</li>
            <li>
              PC で <Link href="/upload/bulk" className="font-bold underline">まとめて投稿</Link> を開き、写真かフォルダごとドラッグ＆ドロップします
            </li>
          </Steps>
        </Section>

        <Section title="この送り方では位置情報が消えます">
          <ul className="ml-4 list-disc space-y-1">
            <li>LINE で送った写真</li>
            <li>X・Instagram などの SNS に載せた写真を保存したもの</li>
            <li>写真を写したスクリーンショット</li>
          </ul>
          <p>位置情報の無い写真は、まとめて投稿の画面で「位置情報が無い」に分けられ、投稿されません。</p>
        </Section>

        <Section title="うまくいかないとき">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <span className="font-bold">「位置情報が無い」と出る</span>: 撮ったときにカメラの位置情報が OFF だったか、上の消える送り方で移した写真です
            </li>
            <li>
              <span className="font-bold">「近くにポケふたが無い」と出る</span>: 蓋から 50m 以内で撮った写真だけを投稿できます。画面に一番近い蓋までの距離が出ます
            </li>
          </ul>
        </Section>

    </HelpShell>
  );
}
