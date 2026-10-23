import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { BULK_MAX_FILES } from '@/lib/bulk-upload';
import { HelpShell, Note, Section, Steps } from '../HelpParts';

export const metadata: Metadata = {
  title: `まとめて投稿の使い方 | ${SITE_NAME}`,
  description:
    '旅行の写真をまとめて選ぶと、写真の位置情報からポケふたを見つけて、ポケふたの写真だけを一度に投稿できます。PC と iPhone で使えます（ベータ）。',
  alternates: { canonical: `${SITE_URL}/help/bulk-upload` },
  robots: { index: true, follow: true },
};

export default function BulkUploadHelpPage() {
  return (
    <HelpShell
      title="まとめて投稿の使い方"
      current="/help/bulk-upload"
      lead={
        <p>
          旅行の写真をまとめて選ぶと、写真の位置情報からポケふたを見つけて、ポケふたの写真だけを一度に投稿できます。
          確認するまで何も送りません。今はベータ版です。
        </p>
      }
    >
      <Section title="使える端末">
        <ul className="ml-4 list-disc space-y-1">
          <li>PC（Windows・Mac）のブラウザ</li>
          <li>iPhone の Safari・Chrome（<Link href="/help/iphone-photos" className="underline">iPhone の写真を投稿する</Link>）</li>
          <li>
            Android のスマホでは使えません。写真を PC に移して投稿してください（
            <Link href="/help/android-photos" className="underline">Android の写真を PC に移す方法</Link>）
          </li>
        </ul>
      </Section>

      <Section title="使い方">
        <Steps>
          <li>
            <Link href="/upload/bulk" className="font-bold underline">まとめて投稿</Link> を開きます（ログインが要ります）
          </li>
          <li>
            「写真を選ぶ」から写真を選びます。PC では写真やフォルダをドラッグ＆ドロップできます。1回 {BULK_MAX_FILES} 枚まで、JPEG・PNG・HEIC
          </li>
          <li>写真の位置情報と撮影日時を端末の中で読み、写真を振り分けます（まだ送っていません）</li>
          <li>蓋と撮影日ごとのカードで確かめ、投稿しない写真はタップして外します</li>
          <li>「◯枚（◯か所）を投稿する」を押します。送り終わるまでページを閉じないでください</li>
        </Steps>
      </Section>

      <Section title="写真の振り分け">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <span className="font-bold">投稿できる</span>: 位置情報があり、蓋から 50m 以内で撮った写真です。最初から選ばれています
          </li>
          <li>
            <span className="font-bold">投稿済みの訪問に当たった</span>: 同じ蓋・同じ日の投稿がもうある写真です。最初は外してあり、選ぶとその投稿に写真を足します。足した写真は蓋のページには載りますが、トップページの新着には出ません
          </li>
          <li>
            <span className="font-bold">近くにポケふたが無い</span>: 蓋から 50m より遠くで撮った写真です。一番近い蓋と距離を出します。風景や食事の写真もここに入るので、気にしなくて大丈夫です
          </li>
          <li>
            <span className="font-bold">位置情報が無い</span>: 写真に位置情報が入っていません（
            <Link href="/help/bulk-upload-trouble#no-gps" className="underline">理由と対処</Link>）
          </li>
        </ul>
      </Section>

      <Section title="カードの見方">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>カードは「蓋 × 撮影日」で1枚です。同じ日に同じ蓋で撮った写真は、1回の訪問としてまとめて投稿されます</li>
          <li>
            <span className="font-bold">初めて</span>: まだ投稿したことのない蓋です。投稿するとスタンプ帳に新しく加わります
          </li>
          <li>
            <span className="font-bold">周辺の風景</span>: 蓋ではなく周りの景色を撮った写真はチェックを入れてください。蓋の代表の写真には使われません
          </li>
          <li>撮影日の古い順に並びます</li>
        </ul>
      </Section>

      <Section title="公開について">
        <p>
          まとめて投稿した写真は<strong>すべて公開</strong>になり、蓋のページに並びます。非公開にしたい写真は
          <Link href="/upload" className="underline">1枚ずつの投稿</Link>から投稿してください。
        </p>
        <p>
          同じ蓋・同じ日の訪問が非公開のときは、その訪問に写真を足せません。
          <Link href="/visits?tab=trip" className="underline">スタンプ帳の「旅の記録」</Link>でその訪問を公開にしてから、まとめて投稿を開き直して写真を選び直すと足せます。
        </p>
      </Section>

      <Section title="送信中・送信のあと">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>カードごとに順番に送ります。送れなかった写真は「残りをもう一度送る」で送り直せます</li>
          <li>「中止する」を押すと、送り終えた写真はそのまま残り、残りは送りません</li>
          <li>送り終えると、投稿した枚数と「新しく集めた蓋」の数が出ます。次に来る人へのひとことは、蓋のページで書けます</li>
        </ul>
      </Section>

      <div className="mt-8">
        <Note>
          ベータ版です。うまく動かないときは、
          <Link href="/help/bulk-upload-trouble" className="font-bold underline">うまくいかないとき</Link>
          を読むか、X の <span className="font-bold">@pokemonmanhole</span> に教えてください。
        </Note>
      </div>
    </HelpShell>
  );
}
