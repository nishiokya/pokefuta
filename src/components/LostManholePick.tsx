'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/gtag';

/**
 * 404 ページの「かわりに、こんなポケふたはいかが？」。
 *
 * 候補（有名なポケモンが1体だけ描かれたポケふた）は図鑑が日次で生成する
 * `data.pokefuta.com/api/lost-manholes.json` を読む（tracker の generate_404_page.py）。
 * 図鑑の 404.html も同じ候補・同じ選び方（先にポケモンを等確率で選ぶ）にしてある。
 * 読めないときは初期表示のヤドンのまま。
 */

const STATIC_BASE =
  process.env.NEXT_PUBLIC_POKEFUTA_STATIC_BASE ?? 'https://data.pokefuta.com';
const CANDIDATES_URL = `${STATIC_BASE}/api/lost-manholes.json`;

interface LostManhole {
  id: string;
  pokemon: string;
  place: string;
}

// JS や候補の取得が間に合わなくても1枚は出す（図鑑の 404.html の初期表示と同じ）
const DEFAULT_PICK: LostManhole = { id: '28', pokemon: 'ヤドン', place: '香川県高松市' };

function pickOne(items: LostManhole[], current: LostManhole | null): LostManhole {
  const byPokemon = new Map<string, LostManhole[]>();
  for (const item of items) {
    const list = byPokemon.get(item.pokemon) ?? [];
    list.push(item);
    byPokemon.set(item.pokemon, list);
  }
  let names = Array.from(byPokemon.keys());
  if (names.length > 1 && current) names = names.filter((name) => name !== current.pokemon);
  const list = byPokemon.get(names[Math.floor(Math.random() * names.length)])!;
  return list[Math.floor(Math.random() * list.length)];
}

function trackClick(destination: string) {
  trackEvent('p_not_found_click', { surface: 'not_found', destination });
}

export default function LostManholePick() {
  const [items, setItems] = useState<LostManhole[]>([]);
  const [pick, setPick] = useState<LostManhole>(DEFAULT_PICK);

  useEffect(() => {
    let cancelled = false;
    fetch(CANDIDATES_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: LostManhole[] } | null) => {
        const list = (data?.items ?? []).filter((it) => it && it.id && it.pokemon);
        if (cancelled || list.length === 0) return;
        setItems(list);
        setPick(pickOne(list, null));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const showMore = () => {
    const next = pickOne(items, pick);
    setPick(next);
    trackEvent('p_not_found_shuffle', { surface: 'not_found', pokemon: next.pokemon });
  };

  return (
    <>
      <Link
        className="lost__pick"
        href={`/manhole/${encodeURIComponent(pick.id)}`}
        onClick={() => trackClick('manhole')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lost__lid"
          src={`${STATIC_BASE}/manhole/image/${encodeURIComponent(pick.id)}_lid.jpeg`}
          alt={`${pick.pokemon}のポケふた`}
          width={220}
          height={220}
        />
        <span className="lost__caption">
          <b>{pick.pokemon}</b>のポケふた
        </span>
        <span className="lost__place">{pick.place}</span>
        <span className="lost__go">このポケふたを見る ›</span>
      </Link>
      {new Set(items.map((it) => it.pokemon)).size > 1 && (
        <button className="lost__more" type="button" onClick={showMore}>
          ほかのポケふたを見る
        </button>
      )}

      <ul className="lost__links">
        <li>
          <a className="lost__link" href="https://data.pokefuta.com/" onClick={() => trackClick('dex')}>
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
