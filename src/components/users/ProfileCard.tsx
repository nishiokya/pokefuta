'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Instagram, Pencil, UserRound } from 'lucide-react';
import { INSTAGRAM_HOSTS, X_HOSTS, safeSocialUrl } from '@/lib/social-url';
import PosterRegularBadge from '@/components/PosterRegularBadge';
import ShareButtons from '@/components/ShareButtons';
import { SITE_URL } from '@/lib/constants';
import { loadPublicVisitStats, type PublicVisitStats } from '@/lib/public-visit-stats';
import { userVisitsShareText } from '@/lib/share';
import { createBrowserClient } from '@/lib/supabase/client';

// スタンプ帳(/visits)のユーザ情報カード。
// 表示専用。編集は /profile（ヘッダーの名前クリックでも到達できる唯一の編集場所）に集約する。

type Profile = {
  displayName: string;
  bio: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
  publicUserId: string | null;
};

const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

// showShare を付けると、公開スタンプ帳を共有するボタンを出す（スタンプ帳から）。
// 公開ページ側には置かない: 押すのはほぼ持ち主本人なので、本人が見るここに置く
export default function ProfileCard({
  className = '',
  showShare = false,
}: {
  className?: string;
  showShare?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  // 共有文の数字はリンク先の公開ページと同じもの（公開の記録だけ）。本人の全記録から数えるとずれる
  const [shareStats, setShareStats] = useState<PublicVisitStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/profile');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.profile) setProfile(data.profile);
      } catch {
        // プロフィールカードは補助UIなので、取得失敗時はカード自体を出さない
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const publicUserId = profile?.publicUserId ?? null;
  useEffect(() => {
    if (!showShare || !publicUserId) return;
    let cancelled = false;
    loadPublicVisitStats(createBrowserClient(), publicUserId)
      .then((stats) => {
        if (!cancelled) setShareStats(stats);
      })
      .catch(() => {
        // 数字が取れなければ共有ボタンを出さない（ずれた数字で共有させない）
      });
    return () => { cancelled = true; };
  }, [showShare, publicUserId]);

  if (!profile) return null;

  const xUrl = safeSocialUrl(profile.xUrl, X_HOSTS);
  const instagramUrl = safeSocialUrl(profile.instagramUrl, INSTAGRAM_HOSTS);

  return (
    <div className={`overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p style={{ fontFamily: ROUND, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', textTransform: 'uppercase' }}>
          トレーナー情報
        </p>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#8C6A4A]/25 bg-[#efe6cf] px-3 py-1 font-pixelJp text-[11px] font-bold text-[#4F3828] transition hover:bg-[#e9dfc7]"
        >
          <Pencil className="h-3 w-3" />
          プロフィール編集
        </Link>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#bf5640]/40 bg-[#efe6cf]">
          <UserRound className="h-5 w-5 text-[#8C6A4A]" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate font-pixelJp text-base font-bold text-[#4F3828]">{profile.displayName}</p>
            <PosterRegularBadge publicUserId={profile.publicUserId} />
          </div>
          {profile.bio && (
            <p className="mt-0.5 text-xs leading-5 text-[#6A4D36]" style={{ fontFamily: ROUND }}>
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {(xUrl || instagramUrl || profile.publicUserId) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {xUrl && (
            <a href={xUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#e9dfc7] bg-white px-3 py-1 text-[11px] font-bold text-[#4F3828]">
              <span className="text-xs font-black">X</span>
            </a>
          )}
          {instagramUrl && (
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#e9dfc7] bg-white px-3 py-1 text-[11px] font-bold text-[#4F3828]">
              <Instagram className="h-3.5 w-3.5" />
            </a>
          )}
          {profile.publicUserId && (
            <Link
              href={`/users/${encodeURIComponent(profile.publicUserId)}/visits`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#bf5640]/30 bg-[#fdf1ec] px-3 py-1 font-pixelJp text-[11px] font-bold text-[#bf5640]"
            >
              <ExternalLink className="h-3 w-3" />
              公開スタンプ帳を見る
            </Link>
          )}
          {profile.publicUserId && showShare && shareStats && (
            <ShareButtons
              compact
              className="ml-auto"
              label="自慢する"
              shareText={userVisitsShareText(profile.displayName, shareStats.totalVisits, shareStats.prefectureCount)}
              shareUrl={`${SITE_URL}/users/${encodeURIComponent(profile.publicUserId)}/visits`}
              hashtags={['ポケふたスタンプ帳']}
            />
          )}
        </div>
      )}
    </div>
  );
}
