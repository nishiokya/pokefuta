'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEX_SITE_ORIGIN, prefectureDexUrl } from '@/lib/prefectureSlug';
import { formatGap, type MonthlyTopic } from '@/lib/monthly-topics';

type Topics = { month: number; topics: MonthlyTopic[] };

/**
 * トップのヒーローの「◯月の話題」。/api/monthly-topics が返した出来事を1行ずつ並べる。
 * 取れるまで・話題が無いときは何も描かない（ヒーローの末尾に置いているので、遅れて出ても CTA は動かない）。
 * 蓋の画像は図鑑の蓋の切り抜き（`<id>_lid.jpeg`）。写真の切り抜き枠を待たずに丸く見せられる。
 */
export default function MonthlyTopics() {
  const [data, setData] = useState<Topics | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/monthly-topics')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.success || typeof json.month !== 'number' || !Array.isArray(json.topics)) return;
        if (json.topics.length > 0) setData({ month: json.month, topics: json.topics });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  return (
    <div className="relative mt-3 rounded-[8px] border border-[#7B63A8]/20 bg-white/70 p-2.5 sm:mt-4 sm:p-4">
      <p className="mb-1.5 text-xs font-extrabold tracking-wide text-[#7B63A8] sm:mb-2">{data.month}月の話題</p>
      <ul className="grid gap-1.5 sm:grid-cols-3 sm:gap-2">
        {data.topics.map((topic) => (
          <li key={topic.kind} className="min-w-0">
            <TopicRow topic={topic} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopicRow({ topic }: { topic: MonthlyTopic }) {
  const body = (
    <>
      <span className="flex shrink-0 -space-x-2">
        {topic.manholeIds.map((id) => (
          <img
            key={id}
            src={`${DEX_SITE_ORIGIN}/manhole/image/${id}_lid.jpeg`}
            alt=""
            width={32}
            height={32}
            loading="lazy"
            className="h-8 w-8 rounded-full border-2 border-white bg-[#EFE4CC] object-cover shadow-sm"
          />
        ))}
      </span>
      <span className="min-w-0 text-xs leading-snug text-[#4A4A4A] sm:text-sm">
        <TopicText topic={topic} />
      </span>
    </>
  );
  const className = 'flex items-center gap-2 rounded-lg bg-white p-1.5 shadow-sm transition hover:shadow sm:p-2';

  // 県の話題は図鑑の県ページへ（写真館の県ページは閉じて図鑑へ転送している）
  if (topic.kind === 'busy') {
    const href = prefectureDexUrl(topic.prefecture);
    return href ? <a href={href} className={className}>{body}</a> : <div className={className}>{body}</div>;
  }
  return <Link href={`/manhole/${topic.manholeIds[0]}`} className={className}>{body}</Link>;
}

function TopicText({ topic }: { topic: MonthlyTopic }) {
  switch (topic.kind) {
    case 'first':
      return (
        <>
          <b>{topic.place}</b>のポケふた{topic.count > 1 ? `${topic.count}枚` : ''}に
          <span className="whitespace-nowrap">初めての写真</span>
        </>
      );
    case 'comeback':
      return (
        <>
          <b>{topic.place}</b>で<span className="whitespace-nowrap">{formatGap(topic.days)}ぶりに撮影</span>
        </>
      );
    case 'busy':
      return (
        <>
          <b>{topic.prefecture}</b>がにぎわう
          <span className="whitespace-nowrap">（蓋{topic.lids}枚に写真{topic.photos}枚）</span>
        </>
      );
  }
}
