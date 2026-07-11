'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import { AlertCircle, Camera, CheckCircle, Upload } from 'lucide-react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { createBrowserClient } from '@/lib/supabase/client';
import { isValidCoordinates } from '@/lib/location';

type GpsSource = 'exif' | null;

export default function DesignManholeNewPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsSource, setGpsSource] = useState<GpsSource>(null);
  const [exifChecking, setExifChecking] = useState(false);

  // プレビューURLは差し替え時・アンマウント時に解放する
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
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
    // プレビューURLの解放は useEffect クリーンアップが行う
    setPreviewUrl(URL.createObjectURL(selected));

    // EXIF は圧縮前のオリジナルから読む（圧縮でGPSが失われるため）
    setExifChecking(true);
    try {
      const raw = await exifr.parse(selected, {
        gps: true, tiff: true, exif: true, xmp: false, icc: false, iptc: false,
      });
      if (isValidCoordinates(raw?.latitude, raw?.longitude)) {
        setLat(raw.latitude);
        setLng(raw.longitude);
        setGpsSource('exif');
      } else {
        // 前の写真のEXIF座標を引きずらない
        setLat(null);
        setLng(null);
        setGpsSource(null);
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
      setLat(null);
      setLng(null);
      setGpsSource(null);
    } finally {
      setExifChecking(false);
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

  // スマホの背面カメラで直接撮影する（/upload と同じ導線）
  const captureFromCamera = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        await onDrop(Array.from(target.files));
      }
    };
    input.click();
  };

  const canSubmit = !!file && lat != null && lng != null && !exifChecking && !submitting;

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
        <p className="mt-2 text-right text-xs">
          <Link href="/upload" className="text-[#7B63A8] underline hover:opacity-80">
            ポケふた（ポケモンマンホール）の写真投稿はこちら →
          </Link>
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
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="投稿する写真のプレビュー"
                  className="mx-auto max-h-64 rounded-lg object-contain"
                />
                <p className="mt-2 text-xs text-[#2A2A2A]/50">タップして写真を変更できます</p>
              </>
            ) : (
              <>
                <Upload className={`mx-auto mb-2 h-10 w-10 ${isDragActive ? 'text-[#7B63A8]' : 'text-[#7B63A8]/50'}`} />
                <p className="text-sm text-[#2A2A2A]/60">
                  {isDragActive ? '写真をドロップ！' : 'タップして写真を選択（またはドラッグ&ドロップ）'}
                </p>
                <p className="mt-1 text-xs text-[#2A2A2A]/50">
                  JPEG, PNG, WebP, HEIC形式に対応
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    captureFromCamera();
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#7B63A8] px-4 py-2 text-xs font-bold text-[#7B63A8] transition hover:bg-[#7B63A8]/10"
                >
                  <Camera className="h-4 w-4" />
                  カメラで撮影
                </button>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-[#2A2A2A]/60">
            できるだけ「真上から・マンホール全体（ふたの縁まで）が入る」写真だと、とても助かります。
          </p>
          {file && exifChecking && (
            <p className="mt-2 text-xs text-[#2A2A2A]/60">
              写真の位置情報を確認中...
            </p>
          )}
          {file && !exifChecking && gpsSource === 'exif' && lat != null && lng != null && (
            <p className="mt-2 text-xs text-[#4C9A57]">
              写真から位置情報を取得しました（緯度 {lat.toFixed(6)} / 経度 {lng.toFixed(6)}）。
            </p>
          )}
          {file && !exifChecking && gpsSource !== 'exif' && (
            <p className="mt-2 text-xs text-[#B5483C]">
              写真に位置情報がありません。位置情報（GPS）付きの写真を選んでください。
            </p>
          )}
        </section>

        {/* 撮影のコツ（/upload と同じガイド） */}
        <details className="mt-4 rounded-lg border border-[#7B63A8]/15 bg-white/70 p-3">
          <summary className="cursor-pointer text-sm font-bold">撮影のコツ（OK / NG例）</summary>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-[#4C9A57]/30 bg-[#4C9A57]/5 p-2">
              <div className="mb-1 flex items-center gap-1 text-xs font-bold text-[#4C9A57]">
                <CheckCircle className="w-3 h-3" />
                <span>OK</span>
              </div>
              <ul className="space-y-1 text-xs text-[#2A2A2A]/70">
                <li>・マンホール全体が入っている</li>
                <li>・真上に近い角度で撮れている</li>
                <li>・絵柄や文字がはっきり見える</li>
              </ul>
            </div>

            <div className="rounded-lg border border-[#B5483C]/30 bg-[#B5483C]/5 p-2">
              <div className="mb-1 flex items-center gap-1 text-xs font-bold text-[#B5483C]">
                <AlertCircle className="w-3 h-3" />
                <span>NG</span>
              </div>
              <ul className="space-y-1 text-xs text-[#2A2A2A]/70">
                <li>・斜めすぎて歪んでいる</li>
                <li>・反射/影で見えにくい</li>
                <li>・暗い/ブレている</li>
              </ul>
            </div>
          </div>

          <p className="mt-2 text-xs text-[#2A2A2A]/60">
            📍 <strong>位置情報（GPS）付きの写真が必要です。</strong> 設置場所は写真のEXIFから自動で読み取ります。ポケふた投稿と異なり登録済みマンホールとの照合はないため、どの場所のマンホールでも投稿できます。
          </p>
        </details>

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
