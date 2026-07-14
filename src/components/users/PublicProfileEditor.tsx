'use client';

import { FormEvent, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  displayName: string;
  bio: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
};

export default function PublicProfileEditor({ displayName, bio, xUrl, instagramUrl }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    const form = new FormData(event.currentTarget);
    let response: Response;
    try {
      response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.get('displayName'),
          bio: form.get('bio'),
          xUrl: form.get('xUrl'),
          instagramUrl: form.get('instagramUrl'),
        }),
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

    setSaved(true);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setOpen(true); setSaved(false); }}
          className="inline-flex items-center gap-2 rounded-full border border-[#8C6A4A]/30 bg-white/75 px-3 py-1.5 text-xs font-extrabold text-[#4F3828] transition hover:bg-white"
        >
          <Pencil className="h-3.5 w-3.5" />
          プロフィールを編集
        </button>
        {saved && <span className="inline-flex items-center gap-1 text-xs font-bold text-[#39715A]"><Check className="h-3.5 w-3.5" />保存しました</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 rounded-[8px] border border-[#8C6A4A]/20 bg-white/80 p-4" aria-label="公開プロフィール編集">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold text-[#4F3828]">公開プロフィール</h2>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-[#6A4D36] hover:bg-[#F6EEDC]" aria-label="編集を閉じる">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-3">
        <Field label="表示名" name="displayName" defaultValue={displayName} maxLength={40} required />
        <label className="grid gap-1 text-xs font-bold text-[#6A4D36]">
          一言
          <textarea name="bio" defaultValue={bio || ''} maxLength={160} rows={3} placeholder="ポケふた巡りについて一言" className="resize-none rounded-[7px] border border-[#8C6A4A]/25 bg-white px-3 py-2 text-sm font-medium text-[#2A2A2A] outline-none focus:border-[#B5483C]" />
        </label>
        <Field label="X URL" name="xUrl" type="url" defaultValue={xUrl || ''} maxLength={300} placeholder="https://x.com/username" inputMode="url" />
        <Field label="Instagram URL" name="instagramUrl" type="url" defaultValue={instagramUrl || ''} maxLength={300} placeholder="https://instagram.com/username" inputMode="url" />
      </div>
      {error && <p role="alert" className="mt-3 text-xs font-bold text-[#B5483C]">{error}</p>}
      <button type="submit" disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#B5483C] px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#963C33] disabled:opacity-60">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {saving ? '保存中…' : '保存する'}
      </button>
    </form>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-[#6A4D36]">
      {label}
      <input {...props} className="rounded-[7px] border border-[#8C6A4A]/25 bg-white px-3 py-2 text-sm font-medium text-[#2A2A2A] outline-none focus:border-[#B5483C]" />
    </label>
  );
}
