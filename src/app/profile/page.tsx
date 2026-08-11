'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ExternalLink, Loader2, LogOut, UserRound } from 'lucide-react';
import PCShell from '@/components/PCShell';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { pokefutaEvents } from '@/lib/analytics/gtag';
import { pageTitle } from '@/lib/constants';
import {
  FRIEND_NOTE_MAX,
  formatFriendCode,
  normalizeFriendCode,
} from '@/lib/pokemon-go-friend-code';

// アカウント管理の唯一の場所。ヘッダーの名前クリックからここに来る。
// プロフィール編集・公開スタンプ帳への導線・ログアウトを集約し、
// スタンプ帳/マイ旅/公開ページには編集UIを置かない。

type Profile = {
  displayName: string;
  bio: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
  publicUserId: string | null;
  pokemonGoFriendCode: string | null;
  pokemonGoFriendNote: string | null;
  pokemonGoFriendOpen: boolean;
};

const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  /** 保存が成功するたびに増やす。非制御フォームを作り直して入力欄を正規化後の値に揃える */
  const [formRevision, setFormRevision] = useState(0);
  const { trackView, trackLogout, clearUser } = useAnalytics();

  useEffect(() => {
    document.title = pageTitle('プロフィール');
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
        // 設定率の分母は導線クリックではなく編集画面への到達にする。
        // 導線は散らばって取りこぼす（投稿ファネルで同じ判断をしている）。
        pokefutaEvents.goFriendEditView({ surface: 'profile' });
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
      pokemonGoFriendCode: String(form.get('pokemonGoFriendCode') ?? ''),
      pokemonGoFriendNote: String(form.get('pokemonGoFriendNote') ?? ''),
      pokemonGoFriendOpen: form.get('pokemonGoFriendOpen') === 'on',
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

    const savedCode = normalizeFriendCode(body.pokemonGoFriendCode);
    if (savedCode) {
      // ひとことの中身は送らない。フリーワードなので個人情報が混じりうる。
      pokefutaEvents.goFriendSaved({
        surface: 'profile',
        is_open: body.pokemonGoFriendOpen,
        has_note: body.pokemonGoFriendNote.trim() !== '',
      });
    }

    // 保存後の姿は送信内容から推測せず、APIが読み直した値で置き換える。
    // コードを空にして保存すると DB 側は一言と募集スイッチも落とすので、
    // 推測で state を組むと画面だけ一言が残る。正規化の規則はDBに1つだけ置く。
    const savedProfile = result.profile as Profile | undefined;
    if (savedProfile) {
      setProfile(savedProfile);
      // 入力欄は非制御なので、state を変えるだけでは画面が追従しない。作り直す。
      setFormRevision((revision) => revision + 1);
    }
    // savedProfile が無いのは、保存は通ったが読み直しに失敗した場合。
    // ここで作り直すと保存前の state で入力欄が埋まり、消したはずのコードや一言が
    // 画面に戻る。次の保存でそれが送られるので、保存前より悪い。
    // 入力欄は利用者が打った内容のまま残す（送信済みの値と一致している）。
    setSaved(true);

    // ヘッダー(SP/PC)は user_metadata.display_name を表示しているため、
    // auth 側にも同期して保存直後から新しい名前が出るようにする
    // （公開表示のソースは app_user のまま。同期に失敗しても保存自体は成功）
    try {
      const supabase = createBrowserClient();
      await supabase.auth.updateUser({ data: { display_name: body.displayName.trim() } });
    } catch {
      // ignore
    }
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
      <div className="flex min-h-content items-center justify-center bg-[#efe6cf]">
        <div className="font-pixelJp text-[#6A4D36]">読み込み中<span className="rpg-loading" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-content safe-area-body bg-[#efe6cf]">

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

            {/*
              入力欄は defaultValue / defaultChecked の非制御フォーム。
              defaultValue はマウント後の値を更新しないので、保存が終わって
              profile state を差し替えても、画面に出ている入力欄は古いまま残る。

              実害: コードを空にして保存すると DB は一言と募集スイッチも落とすが、
              入力欄には一言が、チェックボックスにはONが残る。次に保存すると
              その古い値が送られ、消したはずの設定が復活する。

              key を保存回数で変えてフォームごと作り直し、正規化後の値で
              defaultValue を引き直す。
            */}
            {profile ? (
              <form
                key={`profile-form-${formRevision}`}
                onSubmit={handleSubmit}
                className="mt-4"
                aria-label="プロフィール編集"
              >
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

                {/* Pokémon GO フレンド募集 */}
                <div className="mt-4 rounded-[11px] border border-[#e9dfc7] bg-[#fbf6e9] p-3.5">
                  <p style={{ fontFamily: ROUND, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', textTransform: 'uppercase' }}>
                    Pokémon GO フレンド募集
                  </p>
                  <div className="mt-2.5 grid gap-3">
                    <Field
                      label="トレーナーコード"
                      name="pokemonGoFriendCode"
                      defaultValue={formatFriendCode(profile.pokemonGoFriendCode)}
                      maxLength={20}
                      placeholder="1234 5678 9012"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <Field
                      label={`ひとこと（${FRIEND_NOTE_MAX}文字まで）`}
                      name="pokemonGoFriendNote"
                      defaultValue={profile.pokemonGoFriendNote || ''}
                      maxLength={FRIEND_NOTE_MAX}
                      placeholder="毎日ギフト交換できる方歓迎"
                    />
                    <label className="flex items-start gap-2.5 font-pixelJp text-[11px] font-bold text-[#6A4D36]">
                      <input
                        type="checkbox"
                        name="pokemonGoFriendOpen"
                        defaultChecked={profile.pokemonGoFriendOpen}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#bf5640]"
                      />
                      <span>
                        公開スタンプ帳に「フレンド募集中」として表示する
                        <span className="mt-0.5 block text-[10px] font-medium text-[#9b917e]" style={{ fontFamily: ROUND }}>
                          オフの間はトレーナーコードを誰にも見せません。コードを空にすると募集も止まります。
                        </span>
                      </span>
                    </label>
                    <p className="rounded-[8px] bg-[#fdf1ec] px-3 py-2 text-[10px] leading-4 text-[#8a5a4a]" style={{ fontFamily: ROUND }}>
                      トレーナーコードは誰でも見られます。本名・連絡先・自宅や待ち合わせ場所は
                      ひとことに書かないでください。
                    </p>
                  </div>
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
