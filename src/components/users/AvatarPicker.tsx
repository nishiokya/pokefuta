'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { avatarPhotoUrl } from '@/components/users/UserAvatar';

// /profile のアイコン選び。自分が撮った「公開している訪問」の写真だけを並べる。
//
// 候補はログイン中の /api/visits（自分の訪問と写真）から作る。選べるかどうかの
// 最終判断は DB の set_own_avatar_photo()（他人の写真・非公開訪問の写真は弾く）。
// 風景写真（is_landscape）は外す。アイコンは「マンホールの写真」から選ぶ機能なので。

const PAGE_SIZE = 60;
const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

type Candidate = { photoId: string; title: string };

type VisitsResponse = {
  authenticated?: boolean;
  visits?: Array<{
    is_public?: boolean;
    manhole?: { title?: string | null; name?: string | null } | null;
    photos?: Array<{ id: string; is_landscape?: boolean | null }>;
  }>;
};

type Props = {
  currentPhotoId: string | null;
  onClose: () => void;
  onSaved: (photoId: string | null) => void;
};

export default function AvatarPicker({ currentPhotoId, onClose, onSaved }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | 'clear' | null>(null);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (from: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/visits?with_photos=true&limit=${PAGE_SIZE}&offset=${from}`);
      const data = (await res.json().catch(() => ({}))) as VisitsResponse;
      // 未ログインだと全員の公開訪問が返る。自分の写真だけを出すため、ログイン中の応答以外は使わない
      if (!res.ok || !data.authenticated) {
        setError('写真を読み込めませんでした。再読み込みしてください。');
        return;
      }
      const visits = data.visits ?? [];
      const next: Candidate[] = [];
      for (const visit of visits) {
        if (!visit.is_public) continue;
        const title = visit.manhole?.name || visit.manhole?.title || 'ポケふた';
        for (const photo of visit.photos ?? []) {
          if (photo.is_landscape) continue;
          next.push({ photoId: photo.id, title });
        }
      }
      setCandidates((prev) => {
        const seen = new Set(prev.map((c) => c.photoId));
        return [...prev, ...next.filter((c) => !seen.has(c.photoId))];
      });
      setOffset(from + visits.length);
      setHasMore(visits.length === PAGE_SIZE);
    } catch {
      setError('写真を読み込めませんでした。再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  // Esc で閉じる
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save(photoId: string | null) {
    setSavingId(photoId ?? 'clear');
    setError('');
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error || 'アイコンを保存できませんでした。');
        return;
      }
      onSaved((result.photoId as string | null | undefined) ?? null);
    } catch {
      setError('通信に失敗しました。時間をおいてもう一度お試しください。');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="アイコンにする写真を選ぶ"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-read flex-col overflow-hidden rounded-t-[16px] bg-[#fffdf7] shadow-xl sm:rounded-[16px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e9dfc7] px-4 py-3">
          <div>
            <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">アイコンにする写真を選ぶ</h2>
            <p className="mt-0.5 text-[10px] leading-4 text-[#9b917e]" style={{ fontFamily: ROUND }}>
              公開している訪問の写真から選べます。訪問を非公開にするとアイコンも出なくなります。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#6A4D36] hover:bg-[#efe6cf]"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3">
          {error && <p role="alert" className="mb-2 text-[11px] font-bold text-[#bf5640]">{error}</p>}

          {!loading && candidates.length === 0 && !error && (
            <p className="py-6 text-center text-xs leading-5 text-[#6A4D36]" style={{ fontFamily: ROUND }}>
              公開している訪問の写真がまだありません。<br />
              ポケふたを撮って投稿すると、ここから選べます。
            </p>
          )}

          <ul className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
            {candidates.map((candidate) => {
              const selected = candidate.photoId === currentPhotoId;
              const saving = savingId === candidate.photoId;
              return (
                <li key={candidate.photoId}>
                  <button
                    type="button"
                    onClick={() => save(candidate.photoId)}
                    disabled={savingId !== null}
                    aria-pressed={selected}
                    aria-label={`${candidate.title}の写真をアイコンにする`}
                    title={candidate.title}
                    className={`relative block aspect-square w-full overflow-hidden rounded-full border-2 transition disabled:opacity-60 ${
                      selected ? 'border-[#bf5640] ring-2 ring-[#bf5640]/30' : 'border-[#e9dfc7] hover:border-[#bf5640]/60'
                    }`}
                  >
                    <img
                      src={avatarPhotoUrl(candidate.photoId)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {(selected || saving) && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {loading && (
            <div className="flex justify-center py-4 text-[#6A4D36]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!loading && hasMore && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => loadPage(offset)}
                className="rounded-full border border-[#bf5640]/30 bg-[#fdf1ec] px-4 py-2 font-pixelJp text-xs font-bold text-[#bf5640]"
              >
                もっと見る
              </button>
            </div>
          )}
        </div>

        {currentPhotoId && (
          <div className="border-t border-[#e9dfc7] px-4 py-3">
            <button
              type="button"
              onClick={() => save(null)}
              disabled={savingId !== null}
              className="inline-flex items-center gap-1.5 font-pixelJp text-[11px] font-bold text-[#8C6A4A] underline underline-offset-2 disabled:opacity-60"
            >
              {savingId === 'clear' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              アイコンを外す
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
