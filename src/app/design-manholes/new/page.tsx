'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import { AlertCircle, Camera, CheckCircle, MapPin, RefreshCw, Share2, Upload } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { isValidCoordinates } from '@/lib/location';
import { buildXShareUrl, designManholeShareText } from '@/lib/share';
import { SITE_URL } from '@/lib/constants';
import { createLatestGenerationGuard } from '@/lib/latest-generation';
import {
  OFFICIAL_MANHOLE_NEARBY_CODE,
  OFFICIAL_MANHOLE_NEARBY_RADIUS_KM,
  isDesignManholeSubmissionReady,
  toOfficialManholeCandidate,
  type OfficialManholeCandidate,
} from '@/lib/design-manhole-proximity';
import {
  DESIGN_MANHOLE_SUBMISSION_SUSPENDED,
  DESIGN_MANHOLE_SUBMISSION_SUSPENDED_CODE,
  DESIGN_MANHOLE_SUBMISSION_SUSPENDED_MESSAGE,
} from '@/lib/design-manhole-submission-status';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { useSubmissionFunnel } from '@/lib/hooks/useSubmissionFunnel';
import { classifyClientSubmissionError } from '@/lib/analytics/submission-error';
import type { SubmissionStage } from '@/lib/analytics/gtag';
import SubmissionTypeSwitcher from '@/components/SubmissionTypeSwitcher';

type GpsSource = 'exif' | null;
type ProximityCheckStatus = 'idle' | 'checking' | 'ready' | 'error';

export default function DesignManholeNewPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsSource, setGpsSource] = useState<GpsSource>(null);
  const [exifChecking, setExifChecking] = useState(false);
  const [nearbyOfficialManhole, setNearbyOfficialManhole] =
    useState<OfficialManholeCandidate | null>(null);
  const [confirmedNearbyOfficialManholeId, setConfirmedNearbyOfficialManholeId] =
    useState<number | null>(null);
  const [proximityCheckStatus, setProximityCheckStatus] =
    useState<ProximityCheckStatus>('idle');
  const proximityCheckSequenceRef = useRef(0);
  const photoGenerationGuardRef = useRef(createLatestGenerationGuard());
  const { trackView, trackPhotoUploadStart, trackPhotoUploadComplete, trackSubmissionFailed, trackNavClick, trackShareX } = useAnalytics();
  const funnel = useSubmissionFunnel('design');

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
  const [postedId, setPostedId] = useState<string | null>(null);
  const [postedTitle, setPostedTitle] = useState<string | null>(null);
  const [postedNeedsReview, setPostedNeedsReview] = useState(false);

  // 投稿ファネルの起点。/upload と同じく画面到達を分母にする
  useEffect(() => {
    // is_logged_in を省くと trackView の既定値 false が入り、
    // このファネルのページビューが全部「未ログイン」に化ける。
    // 停止中は middleware が認証を外すので、既定を true に倒さず実際に解決する。
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        trackView('/design-manholes/new', 'デザインマンホール投稿', 'design_manhole_new', Boolean(session?.user));
      } catch {
        // 取得できなければ、保護されている前提（停止中でなければ middleware が認証を保証）
        trackView('/design-manholes/new', 'デザインマンホール投稿', 'design_manhole_new', !DESIGN_MANHOLE_SUBMISSION_SUSPENDED);
      }
    })();
    funnel.start();
    if (DESIGN_MANHOLE_SUBMISSION_SUSPENDED) {
      // 停止中は写真選択にすら進めない。件数が0でないのに気づかない＝戻し忘れ
      funnel.blocked('suspended', 'entry');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const checkNearbyOfficialManhole = useCallback(async (
    latitude: number,
    longitude: number,
    photoGeneration: number
  ) => {
    if (!photoGenerationGuardRef.current.isCurrent(photoGeneration)) return;
    const sequence = ++proximityCheckSequenceRef.current;
    setProximityCheckStatus('checking');
    setNearbyOfficialManhole(null);
    setConfirmedNearbyOfficialManholeId(null);

    try {
      const params = new URLSearchParams({
        lat: String(latitude),
        lng: String(longitude),
        radius: String(OFFICIAL_MANHOLE_NEARBY_RADIUS_KM),
        limit: '1',
      });
      const response = await fetch(`/api/manholes?${params}`);
      if (!response.ok) throw new Error('official manhole lookup failed');

      const data = await response.json();
      const nearest = data?.manholes?.[0];
      const candidate = nearest && typeof nearest.distance === 'number'
        ? toOfficialManholeCandidate(nearest, nearest.distance)
        : null;

      if (
        sequence !== proximityCheckSequenceRef.current ||
        !photoGenerationGuardRef.current.isCurrent(photoGeneration)
      ) return;
      setNearbyOfficialManhole(candidate);
      setProximityCheckStatus('ready');
      if (candidate) {
        // 公式ポケふたが近いので、明示確認するまで送信に進めない
        funnel.blocked('official_manhole_nearby', 'photo');
      }
    } catch (lookupError) {
      console.error('Official manhole proximity check failed:', lookupError);
      if (
        sequence !== proximityCheckSequenceRef.current ||
        !photoGenerationGuardRef.current.isCurrent(photoGeneration)
      ) return;
      setNearbyOfficialManhole(null);
      setProximityCheckStatus('error');
      setError('近くの公式ポケふたを確認できませんでした。再確認してください');
      // 照合できないと投稿を受け付けないので、ここも離脱点
      funnel.blocked('manholes_unavailable', 'photo');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetProximityCheck = useCallback(() => {
    proximityCheckSequenceRef.current += 1;
    setNearbyOfficialManhole(null);
    setConfirmedNearbyOfficialManholeId(null);
    setProximityCheckStatus('idle');
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const selected = acceptedFiles[0];
    if (!selected) return;
    const photoGeneration = photoGenerationGuardRef.current.begin();
    // カメラ導線が立てた 'camera' を1回だけ消費する（次の写真へ持ち越さない）
    const photoSource = funnel.consumePhotoSource();

    setFile(selected);
    setError(null);
    resetProximityCheck();
    setLat(null);
    setLng(null);
    setGpsSource(null);
    setExifPayload(null);
    // プレビューURLの解放は useEffect クリーンアップが行う
    setPreviewUrl(URL.createObjectURL(selected));

    // EXIF は圧縮前のオリジナルから読む（圧縮でGPSが失われるため）
    setExifChecking(true);
    try {
      const raw = await exifr.parse(selected, {
        gps: true, tiff: true, exif: true, xmp: false, icc: false, iptc: false,
      });
      if (!photoGenerationGuardRef.current.isCurrent(photoGeneration)) return;
      const hasGps = isValidCoordinates(raw?.latitude, raw?.longitude);
      funnel.photoSelected({
        photo_source: photoSource,
        has_gps: hasGps,
        has_exif_datetime: !!raw?.DateTimeOriginal,
      });
      if (hasGps) {
        setLat(raw.latitude);
        setLng(raw.longitude);
        setGpsSource('exif');
        await checkNearbyOfficialManhole(
          raw.latitude,
          raw.longitude,
          photoGeneration
        );
        if (!photoGenerationGuardRef.current.isCurrent(photoGeneration)) return;
      } else {
        // 前の写真のEXIF座標を引きずらない
        setLat(null);
        setLng(null);
        setGpsSource(null);
        // GPSが無いと座標を出せず送信できない。デザインふた最大の離脱点
        funnel.blocked('invalid_gps', 'photo');
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
      if (!photoGenerationGuardRef.current.isCurrent(photoGeneration)) return;
      setExifPayload(null);
      setLat(null);
      setLng(null);
      setGpsSource(null);
      // EXIFを読めなかった場合も、利用者から見れば「座標が取れない」で同じ行き止まり
      funnel.photoSelected({ photo_source: photoSource, has_gps: false });
      funnel.blocked('invalid_gps', 'photo');
    } finally {
      if (photoGenerationGuardRef.current.isCurrent(photoGeneration)) {
        setExifChecking(false);
      }
    }
  }, [checkNearbyOfficialManhole, resetProximityCheck]);

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
    // 送信中の差し替えを禁じる。許すと、応答が返るまでの間に選び直した写真の属性が
    // 前の送信の postsend ブロックに付く
    disabled: submitting,
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
        // その場で撮った写真はEXIFにGPSが乗る。ライブラリ経由との離脱差を見るため印を付ける
        funnel.setPhotoSource('camera');
        await onDrop(Array.from(target.files));
      }
    };
    input.click();
  };

  const canSubmit = isDesignManholeSubmissionReady({
    hasFile: !!file,
    hasCoordinates: lat != null && lng != null,
    exifChecking,
    submitting,
    proximityCheckStatus,
    nearbyOfficialManhole,
    confirmedNearbyOfficialManholeId,
  });

  const handleSubmit = async () => {
    if (!file || lat == null || lng == null) return;

    setSubmitting(true);
    setError(null);

    // 失敗イベントに載せる。catch まで持ち越したいので try の外で宣言する
    let failureStage: SubmissionStage = 'compress';
    let responseStatus: number | undefined;
    let responseCode: string | undefined;
    // 送信できずに止まった（＝失敗ではない）ケースをここで区別する
    let blockedBeforeSubmit = false;
    // 送信中に写真を差し替えられても、この送信の属性で送る（refを直接読まない）
    const submittedPhotoSource = funnel.photoSource();
    // 送信の直後に確定する。それまでは「まだ送っていない」を表す 0
    let submittedAttemptNo = 0;
    // postsend のブロックに載せる、この送信の属性
    const submittedAttribution = () => ({
      photo_source: submittedPhotoSource,
      attempt_no: submittedAttemptNo,
    });

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
        // サーバー障害ではなく写真側の問題なので、失敗ではなく離脱として数える
        blockedBeforeSubmit = true;
        funnel.blocked('unsupported_format', 'presend');
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
      if (confirmedNearbyOfficialManholeId != null) {
        formData.append(
          'confirmedNearbyOfficialManholeId',
          String(confirmedNearbyOfficialManholeId)
        );
      }

      funnel.submitting();
      // この送信の番号をここで確定させる。応答時に読み直さない
      submittedAttemptNo = funnel.attemptNo();
      trackPhotoUploadStart({
        submission_kind: 'design',
        is_logged_in: true,
        photo_source: submittedPhotoSource,
        attempt_no: submittedAttemptNo,
      });

      failureStage = 'upload';
      const uploadStartTime = Date.now();
      const res = await fetch('/api/design-manholes', {
        method: 'POST',
        body: formData,
      });
      responseStatus = res.status;

      // サーバーが応答した後の失敗はこちら
      failureStage = 'persist';
      const data = await res.json().catch(() => null);
      responseCode = typeof data?.code === 'string' ? data.code : undefined;

      if (res.status === 401) {
        throw new Error('セッションが切れました。ログインし直してください');
      }
      if (
        res.status === 409 &&
        data?.code === OFFICIAL_MANHOLE_NEARBY_CODE &&
        data?.official_manhole
      ) {
        setNearbyOfficialManhole(data.official_manhole);
        setConfirmedNearbyOfficialManholeId(null);
        setProximityCheckStatus('ready');
        // 差し戻して確認を求めている状態。サーバー障害ではないので失敗に数えない
        blockedBeforeSubmit = true;
        funnel.blocked('official_manhole_nearby', 'postsend', submittedAttribution());
        throw new Error(
          '近くに公式ポケふたがあります。訪問写真として登録するか、別のマンホールであることを確認してください'
        );
      }
      if (!res.ok) {
        // 投稿受付の停止中もここに来る（503）。障害ではないので離脱として数える
        if (data?.code === DESIGN_MANHOLE_SUBMISSION_SUSPENDED_CODE) {
          blockedBeforeSubmit = true;
          funnel.blocked('suspended', 'postsend', submittedAttribution());
        }
        throw new Error(data?.error || '投稿に失敗しました。時間をおいて再度お試しください');
      }

      const status = data?.design_manhole?.status;
      setPostedId(data?.design_manhole?.id ?? null);
      setPostedTitle(data?.design_manhole?.title ?? null);
      setPostedNeedsReview(status === 'needs_review');
      setDone(true);

      funnel.completed();
      trackPhotoUploadComplete({
        submission_kind: 'design',
        is_logged_in: true,
        photo_source: submittedPhotoSource,
        attempt_no: submittedAttemptNo,
        review_status: typeof status === 'string' ? status : undefined,
        upload_duration_ms: Date.now() - uploadStartTime,
        // キャラふたの「ひとこと」と同じ軸にする（任意入力を書いたか）
        has_note: !!description.trim(),
      });
    } catch (err: any) {
      setError(err?.message || '投稿に失敗しました');
      if (!blockedBeforeSubmit) {
        funnel.failed();
        trackSubmissionFailed({
          submission_kind: 'design',
          stage: failureStage,
          status_code: responseStatus,
          error_code: responseCode,
          // サーバーが code を返せなかったときの受け皿。キャラふたと同じ分類を使う
          error_type: classifyClientSubmissionError(err, responseStatus),
          photo_source: submittedPhotoSource,
          attempt_no: submittedAttemptNo,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const postedPageUrl = postedId
      ? `${SITE_URL}/design-manholes/${postedId}`
      : `${SITE_URL}/design-manholes`;
    const shareUrl = buildXShareUrl(
      `${designManholeShareText(postedTitle)}\nみんなのデザインマンホールに投稿しました！`,
      postedPageUrl,
      ['デザインマンホール', 'マンホール'],
      { includeDefaultHashtags: false }
    );

    return (
      <div className="min-h-content safe-area-body bg-[#F3EEF8] pb-nav-safe text-[#2A2A2A]">
        <main className="mx-auto max-w-2xl px-4 pb-8 pt-10 text-center">
          <CheckCircle className="mx-auto h-14 w-14 text-[#4C9A57]" />
          <h1 className="mt-4 text-xl font-bold">投稿ありがとうございます！</h1>
          <p className="mt-2 text-sm text-[#2A2A2A]/70">
            {postedNeedsReview ? (
              <>近くの公式ポケふたとは別の蓋として、確認待ちで受け付けました。確認後に公開されます。</>
            ) : (
              <>投稿されたデザインマンホールは公開されました。翌日には <a href="https://data.pokefuta.com/gmanhole_map.html" target="_blank" rel="noopener noreferrer" className="text-[#7B63A8] underline hover:opacity-80">キャラクターマンホールマップ</a> にも掲載されます。</>
            )}
          </p>
          {!postedNeedsReview && (
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackShareX({ surface: 'design_manhole_submit_complete' })}
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[#2A2A2A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#444444]"
            >
              <Share2 className="h-4 w-4" />
              Xでシェアする
            </a>
          )}
          <div className="mt-4 flex justify-center gap-3">
            {postedId && !postedNeedsReview ? (
              <Link
                href={`/design-manholes/${postedId}`}
                onClick={() => trackNavClick('投稿完了:自分の投稿ページを見る')}
                className="rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
              >
                自分の投稿ページを見る
              </Link>
            ) : (
              <Link
                href="/design-manholes"
                onClick={() => trackNavClick('投稿完了:一覧を見る')}
                className="rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
              >
                一覧を見る
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                trackNavClick('投稿完了:続けて投稿する');
                window.location.reload();
              }}
              className="rounded-lg border border-[#7B63A8] px-5 py-2.5 text-sm font-bold text-[#7B63A8] transition hover:bg-[#7B63A8]/10"
            >
              続けて投稿する
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 停止中はフォームを出さない。写真選択・EXIF解析・近接API通信まで進ませてから
  // 送信だけ弾くと、現地で撮った人の手間を無駄にする。
  if (DESIGN_MANHOLE_SUBMISSION_SUSPENDED) {
    return (
      <div className="min-h-content safe-area-body bg-[#F3EEF8] pb-nav-safe text-[#2A2A2A]">
        <main className="mx-auto max-w-2xl px-4 pb-8 pt-10">
          <SubmissionTypeSwitcher current="design" designSubmissionSuspended />
          <div
            role="status"
            className="mt-5 rounded-xl border-2 border-[#B5483C]/40 bg-[#B5483C]/10 p-5 text-center"
          >
            <AlertCircle className="mx-auto h-10 w-10 text-[#B5483C]" />
            <h1 className="mt-3 text-base font-bold text-[#B5483C]">
              {DESIGN_MANHOLE_SUBMISSION_SUSPENDED_MESSAGE}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#2A2A2A]/70">
              ご迷惑をおかけします。撮っていただいた写真は、復旧後にあらためて投稿してください。
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-[#2A2A2A]/70">
            ポケふた（ポケモンマンホール）の写真投稿は通常どおりご利用いただけます。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/upload"
              className="rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
            >
              ポケふたの写真を投稿する
            </Link>
            <Link
              href="/design-manholes"
              className="rounded-lg border border-[#7B63A8] px-5 py-2.5 text-sm font-bold text-[#7B63A8] transition hover:bg-[#7B63A8]/10"
            >
              みんなのデザインマンホールを見る
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-content safe-area-body bg-[#F3EEF8] pb-nav-safe text-[#2A2A2A]">

      <main className="mx-auto max-w-2xl px-4 pb-8 pt-5 sm:pt-8">
        <SubmissionTypeSwitcher current="design" />
        <div className="mt-4 rounded-xl border border-[#7B63A8]/30 bg-[#F4F0FA] p-4 shadow-sm">
          <p className="text-sm font-extrabold text-[#5E4788]">ここはデザインマンホールの投稿ページです</p>
          <p className="mt-1 text-sm leading-relaxed text-[#2A2A2A]/75">
            キャラクター・ご当地デザインなど、ポケふた以外のマンホールが対象です。写真1枚と位置情報が必須です。
          </p>
        </div>

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

          {lat != null && lng != null && proximityCheckStatus === 'checking' && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[#2A2A2A]/60">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              近くの公式ポケふたを確認中...
            </p>
          )}

          {lat != null && lng != null && proximityCheckStatus === 'error' && (
            <div className="mt-3 rounded-lg border border-[#B5483C]/30 bg-[#B5483C]/10 p-3 text-sm text-[#B5483C]">
              <p>近くの公式ポケふたを確認できませんでした。</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  void checkNearbyOfficialManhole(
                    lat,
                    lng,
                    photoGenerationGuardRef.current.current()
                  );
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#B5483C]/40 bg-white/60 px-3 py-1.5 text-xs font-bold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                再確認する
              </button>
            </div>
          )}

          {nearbyOfficialManhole && proximityCheckStatus === 'ready' && (
            <div className="mt-4 rounded-xl border-2 border-[#7B63A8]/40 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#7B63A8]" />
                <div>
                  <p className="text-sm font-bold text-[#7B63A8]">
                    近くに公式ポケふたがあります
                  </p>
                  <p className="mt-1 text-sm font-bold">{nearbyOfficialManhole.title}</p>
                  <p className="mt-0.5 text-xs text-[#2A2A2A]/65">
                    {nearbyOfficialManhole.pokemons.join('・') || 'ポケモンマンホール'}
                    {' ・ '}写真の位置から約{nearbyOfficialManhole.distance_m}m
                  </p>
                </div>
              </div>

              <Link
                href={`/upload?manhole_id=${nearbyOfficialManhole.id}`}
                className="mt-4 flex w-full items-center justify-center rounded-lg bg-[#7B63A8] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#6A5299]"
              >
                このポケふたの訪問写真として登録
              </Link>

              <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-[#2A2A2A]/15 bg-[#F6EEDC]/70 p-3">
                <input
                  type="checkbox"
                  checked={confirmedNearbyOfficialManholeId === nearbyOfficialManhole.id}
                  onChange={(event) => {
                    setConfirmedNearbyOfficialManholeId(
                      event.target.checked ? nearbyOfficialManhole.id : null
                    );
                    setError(null);
                  }}
                  className="mt-0.5 h-4 w-4 accent-[#7B63A8]"
                />
                <span>
                  <span className="block text-sm font-bold">別のマンホールです</span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#2A2A2A]/60">
                    写真が上の公式ポケふたではなく、近くにある別のデザイン蓋だと確認した場合だけ選択してください。
                  </span>
                </span>
              </label>
            </div>
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
            📍 <strong>位置情報（GPS）付きの写真が必要です。</strong> 設置場所は写真のEXIFから自動で読み取ります。近くに公式ポケふたがある場合は、訪問写真の登録をご案内します。
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
            {submitting
              ? '投稿中...'
              : nearbyOfficialManhole
                ? 'この写真を確認待ちとして投稿する'
                : 'この写真を投稿する'}
          </button>
          <p className="mt-2 text-center text-xs text-[#2A2A2A]/50">
            {nearbyOfficialManhole
              ? '近くに公式ポケふたがある投稿は、確認が完了するまで公開されません。'
              : '投稿された写真と位置情報はすぐに公開されます。'}
          </p>
        </section>
      </main>

    </div>
  );
}
