'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ExternalLink, Loader2, LogOut, UserRound } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PCShell from '@/components/PCShell';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

// アカウント管理の唯一の場所。ヘッダーの名前クリックからここに来る。
// プロフィール編集・公開スタンプ帳への導線・ログアウトを集約し、
// スタンプ帳/マイ旅/公開ページには編集UIを置かない。

type Profile = {
  displayName: string;
  bio: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
  publicUserId: string | null;
};

const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const { trackView, trackLogout, clearUser } = useAnalytics();

  useEffect(() => {
    document.title = 'プロフィール - ポケふたマップ';
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        trackView('/profile', 'プロフィール', 'profile', loggedIn);
        if (!loggedIn) {
          router.replace('/login?redirect=/profile');
          return;
        }
        const res = await fetch('/api/user/profile');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.profile) setProfile(data.profile);
        }
      } catch {
        // 取得失敗時は空のまま（下でエラー表示）
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const body = {
      displayName: String(form.get('displayName') ?? ''),
      bio: String(form.get('bio') ?? ''),
      xUrl: String(form.get('xUrl') ?? ''),
      instagramUrl: String(form.get('instagramUrl') ?? ''),
    };

    let response: Response;
    try {
      response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setSaving(false);
      setError('通信に失敗しました。時間をおいてもう一度お試しください。');
      return;
    }
    const result = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(result.error || 'プロフィールを保存できませんでした。');
      return;
    }

    setProfile((prev) => prev && {
      ...prev,
      displayName: body.displayName.trim(),
      bio: body.bio.trim() || null,
      xUrl: body.xUrl.trim() || null,
      instagramUrl: body.instagramUrl.trim() || null,
    });
    setSaved(true);
  }

  const handleLogout = async () => {
    try {
      const supabase = createBrowserClient();
      await fetch('/api/auth/logout', { method: 'POST' });
      await supabase.auth.signOut();
      trackLogout();
      clearUser();
      router.push('/');
      router.refresh();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efe6cf]">
        <div className="font-pixelJp text-[#6A4D36]">読み込み中<span className="rpg-loading" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen safe-area-inset bg-[#efe6cf]">
      <div className="lg:hidden">
        <Header title="プロフィール" />
      </div>

      <PCShell className="pb-32 pt-4 lg:pt-6">
        <div className="mx-auto max-w-2xl space-y-4">

          {/* プロフィール編集 */}
          <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#bf5640]/40 bg-[#efe6cf]">
                <UserRound className="h-6 w-6 text-[#8C6A4A]" />
              </span>
              <div>
                <h1 className="font-pixelJp text-base font-bold text-[#4F3828]">プロフィール</h1>
                <p className="text-xs text-[#9b917e]" style={{ fontFamily: ROUND }}>
                  入力した内容は
                  {profile?.publicUserId ? (
                    <Link
                      href={`/users/${encodeURIComponent(profile.publicUserId)}/visits`}
                      className="mx-0.5 font-bold text-[#bf5640] underline underline-offset-2"
                    >
                      共有ページ
                    </Link>
                  ) : (
                    '共有ページ'
                  )}
                  に表示されます
                </p>
              </div>
            </div>

            {profile ? (
              <form onSubmit={handleSubmit} className="mt-4" aria-label="プロフィール編集">
                <div className="grid gap-3">
                  <Field label="表示名" name="displayName" defaultValue={profile.displayName} maxLength={40} required />
                  <label className="grid gap-1 font-pixelJp text-[11px] font-bold text-[#6A4D36]">
                    一言
                    <textarea
                      name="bio"
                      defaultValue={profile.bio || ''}
                      maxLength={160}
                      rows={3}
                      placeholder="ポケふた巡りについて一言"
                      className="resize-none rounded-[9px] border border-[#e9dfc7] bg-white px-3 py-2 text-sm font-medium text-[#2A2A2A] outline-none focus:border-[#bf5640]"
                      style={{ fontFamily: ROUND }}
                    />
                  </label>
                  <Field label="X URL" name="xUrl" type="url" defaultValue={profile.xUrl || ''} maxLength={300} placeholder="https://x.com/username" inputMode="url" />
                  <Field label="Instagram URL" name="instagramUrl" type="url" defaultValue={profile.instagramUrl || ''} maxLength={300} placeholder="https://instagram.com/username" inputMode="url" />
                </div>
                {error && <p role="alert" className="mt-3 text-[11px] font-bold text-[#bf5640]">{error}</p>}
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-full bg-[#bf5640] px-5 py-2.5 font-pixelJp text-xs font-bold text-white transition hover:bg-[#a84a37] disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {saving ? '保存中…' : '保存する'}
                  </button>
                  {saved && (
                    <span className="inline-flex items-center gap-1 font-pixelJp text-[11px] font-bold text-[#1f9d63]">
                      <Check className="h-3.5 w-3.5" />
                      保存しました
                    </span>
                  )}
                </div>
              </form>
            ) : (
              <p className="mt-4 text-sm font-bold text-[#bf5640]" style={{ fontFamily: ROUND }}>
                プロフィールを読み込めませんでした。時間をおいて再読み込みしてください。
              </p>
            )}
          </div>

          {/* 公開スタンプ帳 */}
          {profile?.publicUserId && (
            <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm sm:p-5">
              <p style={{ fontFamily: ROUND, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', textTransform: 'uppercase' }}>
                公開ページ
              </p>
              <p className="mt-1.5 text-xs leading-5 text-[#6A4D36]" style={{ fontFamily: ROUND }}>
                公開設定にした訪問記録は、誰でも見られるスタンプ帳ページにまとまります。
              </p>
              <Link
                href={`/users/${encodeURIComponent(profile.publicUserId)}/visits`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#bf5640]/30 bg-[#fdf1ec] px-4 py-2 font-pixelJp text-xs font-bold text-[#bf5640]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                公開スタンプ帳を見る
              </Link>
            </div>
          )}

          {/* アカウント */}
          <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm sm:p-5">
            <p style={{ fontFamily: ROUND, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', textTransform: 'uppercase' }}>
              アカウント
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#B5483C]/30 bg-white px-4 py-2 font-pixelJp text-xs font-bold text-[#B5483C] transition hover:bg-[#B5483C]/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              ログアウト
            </button>
          </div>

        </div>
      </PCShell>

      <BottomNav />
    </div>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1 font-pixelJp text-[11px] font-bold text-[#6A4D36]">
      {label}
      <input
        {...props}
        className="rounded-[9px] border border-[#e9dfc7] bg-white px-3 py-2 text-sm font-medium text-[#2A2A2A] outline-none focus:border-[#bf5640]"
        style={{ fontFamily: ROUND }}
      />
    </label>
  );
}
