import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { BULK_MAX_FILES } from '@/lib/bulk-upload';
import { HelpShell, Qa } from '../HelpParts';

export const metadata: Metadata = {
  title: `まとめて投稿がうまくいかないとき | ${SITE_NAME}`,
  description:
    'まとめて投稿で「位置情報が無い」「近くにポケふたが無い」と出たとき、送信に失敗したとき、HEIC の写真が送れないときの対処です。',
  alternates: { canonical: `${SITE_URL}/help/bulk-upload-trouble` },
  robots: { index: true, follow: true },
};

export default function BulkUploadTroublePage() {
  return (
    <HelpShell title="まとめて投稿がうまくいかないとき" current="/help/bulk-upload-trouble">
      <Qa q="「位置情報が無い」と出る" id="no-gps">
        <p>写真に位置情報が入っていません。よくある理由は次のとおりです。</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>撮ったときに、カメラの位置情報が OFF だった</li>
          <li>Google フォトで場所の下に「推定」と出ている写真（Google が後から推定した場所で、写真そのものには入っていません）</li>
          <li>LINE で受け取った写真、SNS から保存した写真、スクリーンショット</li>
          <li>iPhone で写真を選ぶとき、写真選択の「オプション」で位置情報を外した</li>
          <li>Android のスマホのブラウザで選んだ写真（Android はブラウザに渡すときに位置情報を消します）</li>
        </ul>
        <p>
          位置情報の無い写真は投稿できません。次から撮るときは、カメラの位置情報を ON にしてください（
          <Link href="/help/iphone-photos" className="underline">iPhone</Link>・
          <Link href="/help/android-photos" className="underline">Android</Link>）。
        </p>
      </Qa>

      <Qa q="「近くにポケふたが無い」と出る" id="far">
        <p>
          蓋から 50m 以内で撮った写真だけを投稿できます。画面には一番近い蓋とその距離が出ます。
          旅行の写真をフォルダごと入れた場合、風景や食事の写真はここに入るので、そのままで大丈夫です。
        </p>
        <p>蓋の写真なのにここに入るときは、次を疑ってください。</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>建物の中や地下で撮り、スマホの位置がずれた（GPS ではなく電波で場所を決めると、数百 m ずれることがあります）</li>
          <li>展示されている蓋を撮った（イベントや資料館の展示は、設置場所と位置が違うので投稿できません）</li>
          <li>図鑑にまだ載っていない新しい蓋</li>
        </ul>
      </Qa>

      <Qa q="「投稿済みの訪問」と出る" id="posted">
        <p>
          同じ蓋・同じ日の投稿がもうあります。最初は外してあり、選ぶとその投稿に写真を足します（訪問は増えません）。
          もう投稿した写真を選ぶと同じ写真が二重になるので、足したい写真だけを選んでください。
          その訪問が非公開のときは足せないので、<Link href="/visits/trip" className="underline">スタンプ帳の「旅の記録」</Link>で公開にしてから、
          まとめて投稿を開き直して写真を選び直してください。
        </p>
      </Qa>

      <Qa q="非公開で投稿したい" id="private">
        <p>
          まとめて投稿はすべて公開です。非公開にしたい写真は<Link href="/upload" className="underline">1枚ずつの投稿</Link>から投稿してください。
        </p>
      </Qa>

      <Qa q="「この画像形式は変換できませんでした」と出る・写真が灰色の枠になる" id="heic">
        <p>
          iPhone の HEIC 形式の写真は、Windows のブラウザや Mac の Chrome では開けないことがあります。次のどれかを試してください。
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Mac なら Safari でまとめて投稿を開く</li>
          <li>iPhone から直接まとめて投稿する</li>
          <li>これから撮る写真を JPEG にする（<Link href="/help/iphone-photos#heic" className="underline">iPhone の写真を投稿する</Link>）</li>
        </ul>
      </Qa>

      <Qa q="送信に失敗した" id="failed">
        <p>
          通信が切れたときなどに失敗します。電波の良いところで「残りをもう一度送る」を押してください。
          送れたと確かめられた写真は、もう一度は送りません。
        </p>
        <p>
          ただし、通信が切れて送れたかどうか分からない写真は、再送すると二重になることがあります。
          気になるときは、<Link href="/visits/trip" className="underline">スタンプ帳の「旅の記録」</Link>で投稿されているかを確かめ、
          まとめて投稿を開き直して、まだ投稿されていない写真だけを選んでください。
        </p>
        <p>
          何度送っても失敗するときは、X の <span className="font-bold">@pokemonmanhole</span> に教えてください。
        </p>
      </Qa>

      <Qa q="送信中にページを閉じてしまった" id="left">
        <p>
          送り終えた写真は投稿されています。同じ写真をもう一度選ぶと、送れた蓋のカードは「投稿済みの訪問」として外れた状態で出ます。
          そのカードでは、まだ送っていない写真だけをタップして選んでください（送った写真をもう一度選ぶと二重になります）。
          ブラウザの「戻る」で離れたときは確認が出ないので、送り終わるまでページを開いたままにしてください。
        </p>
      </Qa>

      <Qa q={`${BULK_MAX_FILES} 枚より多く選んだ`} id="limit">
        <p>
          1回に読むのは {BULK_MAX_FILES} 枚までです。超えた分は読まずに、枚数をお知らせします。投稿が終わったら「続けて投稿する」で残りを選んでください。
        </p>
      </Qa>

      <Qa q="撮影日がずれている" id="date">
        <p>
          撮影日時は写真に記録された日時を使います。カメラの時計がずれていると、カードの日付もずれます。
          撮影日時が記録されていない写真は、ファイルの更新日時を使います。
        </p>
      </Qa>
    </HelpShell>
  );
}
