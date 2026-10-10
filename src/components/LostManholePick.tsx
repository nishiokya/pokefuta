'use client';

import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/gtag';

/**
 * 404 ページの本文（ヤドン1体のポケふた＋3つの導線）。
 *
 * 図鑑の 404（pokefuta-tracker の apps/web/404.html）と同じ1枚・同じ文言の固定表示。
 * 何も取りに行かない。クライアントにしているのはクリック計測のためだけ。
 * ヤドン（id 40）が設置データから消えたら、図鑑側の test_404_page が落ちるので両方差し替える。
 */

const SLOWPOKE_ID = '40';
const DATA_SITE_URL = 'https://data.pokefuta.com';

function trackClick(destination: string) {
  trackEvent('p_not_found_click', { surface: 'not_found', destination });
}

export default function LostManholePick() {
  return (
    <>
      <Link className="lost__pick" href={`/manhole/${SLOWPOKE_ID}`} onClick={() => trackClick('manhole')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lost__lid"
          src={`${DATA_SITE_URL}/manhole/image/${SLOWPOKE_ID}_lid.jpeg`}
          alt="ヤドンのポケふた"
          width={220}
          height={220}
        />
        <span className="lost__caption">
          <b>ヤドン</b>もぽかんとしています
        </span>
        <span className="lost__place">香川県綾川町のポケふた</span>
        <span className="lost__go">このポケふたを見る ›</span>
      </Link>

      <ul className="lost__links">
        <li>
          <a className="lost__link" href={`${DATA_SITE_URL}/`} onClick={() => trackClick('dex')}>
            ポケふた図鑑<small>全国のポケふたを探す</small>
          </a>
        </li>
        <li>
          <Link className="lost__link" href="/" onClick={() => trackClick('album')}>
            ポケふた写真館<small>みんなの写真を見る</small>
          </Link>
        </li>
        <li>
          <Link className="lost__link" href="/design-manholes" onClick={() => trackClick('design')}>
            デザインマンホール<small>ご当地のマンホールを見る</small>
          </Link>
        </li>
      </ul>
    </>
  );
}
