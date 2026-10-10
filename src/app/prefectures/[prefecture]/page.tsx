import { notFound, permanentRedirect } from 'next/navigation';
import { prefectureDexUrl, resolvePrefectureParam } from '@/lib/prefectureSlug';

type Props = {
  params: { prefecture: string };
};

/**
 * 写真館の都道府県ページは閉じて、図鑑（data.pokefuta.com）の県ページへ 308 で送る。
 *
 * 2026-09-23（#257）に作ったが、30日で 72 ビュー・検索流入はほぼ無く、トップの
 * 残り県チップ（唯一の入口）も特集に置き換わった。設置情報と写真は図鑑の県ページに
 * そろっているので、同じ題材のページを2ドメインに持たない。
 * 以前のリンク（`/prefectures/東京都` と `/prefectures/tokyo` の両方）を行き止まりにしない
 * ためにルートだけ残す。都道府県でない値は 404。
 */
export default function PrefectureRedirect({ params }: Props) {
  const dexUrl = prefectureDexUrl(resolvePrefectureParam(params.prefecture));
  if (!dexUrl) notFound();
  permanentRedirect(dexUrl);
}
