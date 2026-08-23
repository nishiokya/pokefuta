import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * 本文先頭の戻る導線。
 *
 * ヘッダー（SiteChrome）は全ページ共通の固定内容なので戻るボタンを持たない。
 * `/p/[photoId]` のように OGP 経由の共有リンクで深い階層に直接着地する入口では、
 * ここが唯一の文脈復帰導線になる。**必ずファーストビュー内（本文の最上部）に置くこと。**
 *
 * ## 置く条件: 常時見えているタブと同じ行き先を重ねない
 *
 * 下タブ（SP）と PC ヘッダーは layout から常時描画される。**`探す`(/nearby) と
 * `スタンプ帳`(/visits) はログイン状態に関係なく必ず出る。** このタブと同じ
 * 行き先を Breadcrumb でも出すと、同じリンクが画面に2つ並ぶだけになる。
 *
 * `マイ旅`(/my-trip) だけは面によって違う。SP 下タブは未ログインでも
 * `AUTH_NAV_ITEMS` の3つを出す（投稿 FAB が無いぶん3タブを均等割りするため）が、
 * PC ヘッダーは未ログインだと `GUEST_NAV_ITEMS` の2つになる。
 *
 * `/manhole/[id]` は以前 `/nearby` 行きを置いていたが、下タブ「探す」と
 * 完全に同じ行き先だったので外した。
 *
 * 判定はタブに載っているかどうかで見る。**サイトスイッチャー（写真館 ⇄ 図鑑）は
 * ボタンを開かないと出てこないので、ここでいう「常時見えている」には数えない。**
 * `/users/[userId]/visits` の `/` 行きが残っているのはこのため。
 *
 * 現在の利用箇所:
 *
 * - `/p/[photoId]` → その写真の `/manhole/[id]`（個別ページ。タブに無い）
 * - `/users/[userId]/prefectures/[prefecture]` → そのユーザーのスタンプ帳（同上）
 * - `/users/[userId]/visits` → `/`（スイッチャーを開けば行けるが、タブには無い）
 *
 * ## router.back() を使わない理由
 *
 * 「履歴があれば戻り、無ければリンク」を試したが、ブラウザAPIでは正確に判定できない:
 *
 * - `document.referrer` は **SPA 遷移では空のまま**。アプリ内遷移を直接着地と誤判定する
 * - アプリ内の遷移回数を数える方式は「直接着地 → 別ページ → ブラウザBackで戻る」で
 *   後ろにアプリ内履歴が無いのに true のままになる
 * - 履歴の深さを push/pop で追う方式も、**進むボタン**が popstate を発火させるため
 *   深度がずれる（Navigation API の currentEntry.index は Safari / Firefox に無い）
 *
 * 誤判定すると「押しても何も起きない」「外部サイトへ出てしまう」という最悪の結果になる。
 * 行き先を固定してラベルにもそう書くほうが、予測可能で壊れようがない。
 * ブラウザの戻るボタンは当然そのまま使える。
 */
export default function Breadcrumb({ href, label }: { href: string; label: string }) {
  return (
    <nav aria-label="パンくず" className="mb-1">
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 py-2 text-sm font-bold text-[#4F3828] transition hover:opacity-70"
        style={{ minHeight: 'var(--chrome-tap-min)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Link>
    </nav>
  );
}
