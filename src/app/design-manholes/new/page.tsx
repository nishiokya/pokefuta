'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useDropzone } from 'react-dropzone';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import { Camera, CheckCircle, MapPin } from 'lucide-react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { createBrowserClient } from '@/lib/supabase/client';
import { isValidCoordinates } from '@/lib/location';

const LocationPickerMap = dynamic(
  () => import('@/components/DesignManhole/LocationPickerMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-full items-center justify-center rounded-lg bg-[#EFE5CE] sm:h-80">
        <span className="text-sm text-[#7B63A8]">地図を読み込み中...</span>
      </div>
    ),
  }
);

type GpsSource = 'exif' | 'manual' | null;

export default function DesignManholeNewPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsSource, setGpsSource] = useState<GpsSource>(null);
  const [exifPayload, setExifPayload] = useState<Record<string, any> | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // ニックネーム初期値はログインユーザーの表示名（ページ自体は middleware が保護）
  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createBrowserClient();
      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (cancelled || !session?.user) return;
          const displayName =
            session.user.user_metadata?.display_name ||
            session.user.email?.split('@')[0] ||
            '';
          setSubmitterName((prev) => prev || displayName);
        })
        .catch((e) => {
          // 表示名プレフィルは補助機能なので失敗しても投稿は続行できる
          console.error('Failed to get session for display name:', e);
        });
    } catch (e) {
      console.error('Supabase initialization error:', e);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const selected = acceptedFiles[0];
    if (!selected) return;

    setFile(selected);
    setError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(selected);
    });

    // EXIF は圧縮前のオリジナルから読む（圧縮でGPSが失われるため）
    try {
      const raw = await exifr.parse(selected, {
        gps: true, tiff: true, exif: true, xmp: false, icc: false, iptc: false,
      });
      if (isValidCoordinates(raw?.latitude, raw?.longitude)) {
        setLat(raw.latitude);
        setLng(raw.longitude);
        setGpsSource('exif');
      } else {
        // 前の写真のEXIF座標を引きずらない（手動で置いたピンは維持する）
        setGpsSource((prev) => {
          if (prev === 'exif') {
            setLat(null);
            setLng(null);
            return null;
          }
          return prev;
        });
      }
      if (raw) {
        setExifPayload({
          DateTimeOriginal: raw.DateTimeOriginal ?? null,
          GPSDateStamp: raw.GPSDateStamp ?? null,
          GPSProcessingMethod: raw.GPSProcessingMethod ?? null,
          GPSHPositioningError: raw.GPSHPositioningError ?? null,
          Make: raw.Make ?? null,
          Model: raw.Model ?? null,
          Software: raw.Software ?? null,
        });
      } else {
        setExifPayload(null);
      }
    } catch {
      setExifPayload(null);
      setGpsSource((prev) => {
        if (prev === 'exif') {
          setLat(null);
          setLng(null);
          return null;
        }
        return prev;
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // サーバーが受けるのは JPEG/PNG/WebP。HEIC/HEIF は送信前に JPEG へ変換するので許可
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleLocationChange = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setGpsSource((prev) => (prev === 'exif' ? prev : 'manual'));
  }, []);

  const canSubmit = !!file && lat != null && lng != null && !submitting;

  const handleSubmit = async () => {
    if (!file || lat == null || lng == null) return;

    setSubmitting(true);
    setError(null);

    try {
      let uploadFile: File;
      try {
        // HEIC もここで JPEG に変換される（canvas デコード）
        uploadFile = await imageCompression(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 2048,
          useWebWorker: true,
        });
      } catch {
        throw new Error('この画像形式は変換できませんでした。JPEG画像でお試しください');
      }

      const formData = new FormData();
      formData.append('file', uploadFile, file.name);
      formData.append('lat', String(lat));
      formData.append('lng', String(lng));
      if (title.trim()) formData.append('title', title.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (submitterName.trim()) formData.append('submitterName', submitterName.trim());
      if (exifPayload) formData.append('exif', JSON.stringify(exifPayload));

      const res = await fetch('/api/design-manholes', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        throw new Error('セッションが切れました。ログインし直してください');
      }
      if (!res.ok) {
        throw new Error(data?.error || '投稿に失敗しました。時間をおいて再度お試しください');
      }

      setDone(true);
    } catch (err: any) {
      setError(err?.message || '投稿に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
        <Header title="デザインマンホール投稿" showDescriptionLink={false} />
        <main className="mx-auto max-w-2xl px-4 pb-8 pt-10 text-center">
          <CheckCircle className="mx-auto h-14 w-14 text-[#4C9A57]" />
          <h1 className="mt-4 text-xl font-bold">投稿ありがとうございます！</h1>
          <p className="mt-2 text-sm text-[#2A2A2A]/70">
            投稿されたデザインマンホールは公開されました。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/design-manholes"
              className="rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
            >
              一覧を見る
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-[#7B63A8] px-5 py-2.5 text-sm font-bold text-[#7B63A8] transition hover:bg-[#7B63A8]/10"
            >
              続けて投稿する
            </button>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <Header title="デザインマンホール投稿" showDescriptionLink={false} />

      <main className="mx-auto max-w-2xl px-4 pb-8 pt-5 sm:pt-8">
        <p className="rounded-lg border border-[#7B63A8]/15 bg-white/70 p-3 text-sm leading-relaxed text-[#2A2A2A]/80">
          ポケふた以外の「オンリーワンなデザインマンホール」を見つけたら教えてください。
          写真1枚と位置情報が必須です。
        </p>

        {/* 写真 */}
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Camera className="h-4 w-4 text-[#7B63A8]" />
            写真 <span className="text-[#B5483C]">*</span>
          </h2>
          <div
            {...getRootProps()}
            className={`mt-2 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
              isDragActive
                ? 'border-[#7B63A8] bg-[#7B63A8]/10'
                : 'border-[#7B63A8]/30 bg-white/60 hover:bg-white'
            }`}
          >
            <input {...getInputProps()} />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="投稿する写真のプレビュー"
                className="mx-auto max-h-64 rounded-lg object-contain"
              />
            ) : (
              <p className="text-sm text-[#2A2A2A]/60">
                タップして写真を選択（またはドラッグ&ドロップ）
              </p>
            )}
          </div>
          {file && gpsSource === 'exif' && (
            <p className="mt-2 text-xs text-[#4C9A57]">
              写真から位置情報を取得しました。地図で微調整できます。
            </p>
          )}
          {file && gpsSource !== 'exif' && (
            <p className="mt-2 text-xs text-[#B5483C]">
              写真に位置情報がありません。地図で場所を指定するか、現在地を使ってください。
            </p>
          )}
        </section>

        {/* 位置 */}
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <MapPin className="h-4 w-4 text-[#7B63A8]" />
            位置 <span className="text-[#B5483C]">*</span>
          </h2>
          <p className="mt-1 text-xs text-[#2A2A2A]/60">
            地図をタップしてピンを置き、ドラッグで微調整できます。
          </p>
          <div className="mt-2">
            <LocationPickerMap lat={lat} lng={lng} onChange={handleLocationChange} />
          </div>
          {lat != null && lng != null && (
            <p className="mt-1.5 text-xs text-[#2A2A2A]/60">
              緯度 {lat.toFixed(6)} / 経度 {lng.toFixed(6)}
            </p>
          )}
        </section>

        {/* 任意項目 */}
        <section className="mt-6 space-y-4">
          <div>
            <label htmlFor="dm-title" className="text-sm font-bold">
              タイトル <span className="text-xs font-normal text-[#2A2A2A]/50">（任意）</span>
            </label>
            <input
              id="dm-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="例: ○○市の花柄マンホール"
              className="mt-1.5 w-full rounded-lg border border-[#7B63A8]/20 bg-white px-3 py-2.5 text-sm focus:border-[#7B63A8] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="dm-description" className="text-sm font-bold">
              説明 <span className="text-xs font-normal text-[#2A2A2A]/50">（任意）</span>
            </label>
            <textarea
              id="dm-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="デザインの由来や見つけた場所のメモなど"
              className="mt-1.5 w-full rounded-lg border border-[#7B63A8]/20 bg-white px-3 py-2.5 text-sm focus:border-[#7B63A8] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="dm-name" className="text-sm font-bold">
              表示名 <span className="text-xs font-normal text-[#2A2A2A]/50">（任意）</span>
            </label>
            <input
              id="dm-name"
              type="text"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              maxLength={50}
              placeholder="投稿者名として表示されます"
              className="mt-1.5 w-full rounded-lg border border-[#7B63A8]/20 bg-white px-3 py-2.5 text-sm focus:border-[#7B63A8] focus:outline-none"
            />
          </div>
        </section>

        {/* 送信 */}
        <section className="mt-6">
          {error && (
            <p className="mb-3 rounded-lg border border-[#B5483C]/30 bg-[#B5483C]/10 p-3 text-sm text-[#B5483C]">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-[#7B63A8] py-3 text-sm font-bold text-white transition hover:bg-[#6A5299] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? '投稿中...' : '投稿する'}
          </button>
          <p className="mt-2 text-center text-xs text-[#2A2A2A]/50">
            投稿された写真と位置情報はすぐに公開されます。
          </p>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
