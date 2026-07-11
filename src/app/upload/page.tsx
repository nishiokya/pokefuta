'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useDropzone } from 'react-dropzone';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Camera, Upload, MapPin, CheckCircle, AlertCircle, X } from 'lucide-react';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import { calculateDistance, isValidCoordinates, MAX_DISTANCE_KM } from '@/lib/location';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

interface PhotoMetadata {
  latitude?: number;
  longitude?: number;
  datetime?: string;
  camera?: string;
  lens?: string;
  exifPayload?: Record<string, any>;
}

interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
  metadata: PhotoMetadata;
  matchedManhole?: Manhole;
  uploading: boolean;
  uploaded: boolean;
  uploadedImageId?: string;
  error?: string;
  photoStatus: 'waiting_manhole' | 'invalid_gps' | 'no_nearby_manhole' | 'valid';
}

interface AlertMessage {
  type: 'error' | 'success' | 'warning';
  message: string;
  id: string;
}

function UploadPageInner() {
  const searchParams = useSearchParams();
  const hintManholeId = searchParams.get('manhole_id') ? Number(searchParams.get('manhole_id')) : null;
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [manholes, setManholes] = useState<Manhole[]>([]);
  const [hintManhole, setHintManhole] = useState<Manhole | null>(null);
  const [loading, setLoading] = useState(false);
  const [visitNote, setVisitNote] = useState<string>(''); // 個人メモ（非公開）
  const [visitComment, setVisitComment] = useState<string>(''); // 訪問コメント
  const [isPublic, setIsPublic] = useState<boolean>(true); // 公開設定（デフォルト: 公開）
  const [alerts, setAlerts] = useState<AlertMessage[]>([]); // アラートメッセージ
  const timerRefsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { trackView, trackPhotoUploadStart, trackPhotoUploadComplete, trackAppError, trackVisitRegister } = useAnalytics();

  // ✅ タイマークリーンアップ（コンポーネントアンマウント時）
  useEffect(() => {
    return () => {
      timerRefsRef.current.forEach(timerId => clearTimeout(timerId));
      timerRefsRef.current.clear();
    };
  }, []);

  // ✅ アラートを追加する関数（crypto.randomUUID()で衝突回避）
  const addAlert = useCallback((type: 'error' | 'success' | 'warning', message: string) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    setAlerts(prev => [...prev, { type, message, id }]);
    
    // 5秒後に自動削除（タイマーID保持）
    const timerId = setTimeout(() => {
      setAlerts(prev => prev.filter(alert => alert.id !== id));
      timerRefsRef.current.delete(id);
    }, 5000);
    
    timerRefsRef.current.set(id, timerId);
  }, []);

  // ✅ アラートを削除する関数
  const removeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
    // タイマークリア
    const timerId = timerRefsRef.current.get(id);
    if (timerId) {
      clearTimeout(timerId);
      timerRefsRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    // ページタイトル設定
    document.title = '写真登録 - ポケふた訪問記録';

    // ✅ GA: ページビュー追跡
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        trackView('/upload', '写真登録', 'upload', Boolean(session?.user));
      } catch {
        trackView('/upload', '写真登録', 'upload', true); // middleware が認証を保証
      }
    })();

    loadManholes();
    // Cookieから公開設定を読み込み
    const savedIsPublic = getCookie('pokefuta_is_public');
    if (savedIsPublic !== null) {
      setIsPublic(savedIsPublic === 'true');
    }
  }, []);

  // Cookie操作ヘルパー関数
  const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  const setCookie = (name: string, value: string, days: number = 365) => {
    if (typeof document === 'undefined') return;
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  };

  const loadManholes = async () => {
    try {
      const response = await fetch('/api/manholes');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.manholes) {
          setManholes(data.manholes);
          if (hintManholeId) {
            const found = (data.manholes as Manhole[]).find(m => m.id === hintManholeId);
            if (found) setHintManhole(found);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load manholes:', error);
    }
  };

  // ✅ manholes ロード完了時に既存 photos の matchedManhole/error を再評価
  useEffect(() => {
    if (manholes.length > 0 && photos.length > 0) {
      setPhotos(prevPhotos =>
        prevPhotos.map(photo => {
          // ロード中ステータスの場合のみ再評価
          if (photo.photoStatus === 'waiting_manhole') {
            if (!isValidCoordinates(photo.metadata.latitude, photo.metadata.longitude)) {
              return {
                ...photo,
                photoStatus: 'invalid_gps',
                error: 'GPS座標が見つかりません。写真の位置情報を有効にしてください。'
              };
            }

            const matchedManhole = findNearestManhole(
              photo.metadata.latitude as number,
              photo.metadata.longitude as number
            );

            if (matchedManhole) {
              return {
                ...photo,
                photoStatus: 'valid',
                matchedManhole,
                error: undefined
              };
            } else {
              return {
                ...photo,
                photoStatus: 'no_nearby_manhole',
                error: '50m以内にマンホールが見つかりません。位置情報を確認してください。'
              };
            }
          }
          return photo;
        })
      );
    }
  }, [manholes]);

  const extractMetadata = async (file: File): Promise<PhotoMetadata> => {
    try {
      const raw = await exifr.parse(file, { gps: true, tiff: true, exif: true, xmp: false, icc: false, iptc: false });
      // GPS詐称調査・不正検知に有用なフィールドを保存
      // キーとなるGPS整合性フィールドは存在しない場合も null として明示記録（不在自体がシグナル）
      const rawExif: Record<string, any> = {};
      const required = (key: string) => { rawExif[key] = raw?.[key] ?? null; };
      const optional = (key: string) => { if (raw?.[key] != null) rawExif[key] = raw[key]; };

      // タイムスタンプ整合性（DateTimeOriginal vs GPSDateStamp のズレで詐称を検知）
      required('DateTimeOriginal'); optional('DateTimeDigitized'); optional('ModifyDate');
      optional('OffsetTime'); optional('OffsetTimeOriginal');
      required('GPSDateStamp'); required('GPSTimeStamp');
      // SubSecTimeOriginal: 本物撮影なら通常あり、後付けGPSでは消える傾向
      required('SubSecTimeOriginal'); optional('SubSecTimeDigitized');

      // GPS品質・出所シグナル（不在も記録）
      required('GPSProcessingMethod'); // Android: "GPS"/"NETWORK"/"FUSED" — GPS出所の直接証拠
      required('GPSVersionID');
      required('GPSStatus');           // A=有効計測 / V=無効
      required('GPSMeasureMode');      // "2"=2Dfix / "3"=3Dfix
      required('GPSDOP');              // 精度指標
      required('GPSHPositioningError'); // iOS: 水平誤差(m)
      optional('GPSSatellites');
      optional('GPSSpeed'); optional('GPSSpeedRef');
      optional('GPSImgDirection'); optional('GPSImgDirectionRef');
      optional('GPSAltitude'); optional('GPSAltitudeRef');

      // 編集検知
      optional('Software');

      // デバイス・レンズ一貫性
      optional('Make'); optional('Model');
      optional('LensMake'); optional('LensModel'); optional('LensInfo');
      optional('HostComputer'); // iOSで端末名が入ることがある

      // カメラ動作（実際に撮影されたことを示す特徴量）
      optional('ExifVersion'); optional('FlashPixVersion');
      optional('FNumber'); optional('ExposureTime'); optional('ISO');
      optional('Flash'); optional('FocalLength'); optional('FocalLengthIn35mmFormat');
      optional('PixelXDimension'); optional('PixelYDimension');
      optional('WhiteBalance'); optional('ExposureMode');
      optional('MeteringMode'); optional('SceneCaptureType');
      optional('BrightnessValue');

      const hasGps = isValidCoordinates(raw?.latitude, raw?.longitude);
      const method = rawExif.GPSProcessingMethod;
      const gpsSource: string | null = !hasGps ? null
        : method === 'GPS'     ? 'hardware_gps'
        : method === 'NETWORK' ? 'network'
        : method === 'FUSED'   ? 'fused'
        : rawExif.GPSDateStamp != null ? 'camera'
        : 'unknown';

      const exifPayload = Object.keys(rawExif).length > 0
        ? { raw: rawExif, judge: { gps_source: gpsSource } }
        : undefined;

      return {
        latitude: raw?.latitude,
        longitude: raw?.longitude,
        datetime: raw?.DateTimeOriginal || raw?.DateTime,
        camera: raw?.Make && raw?.Model ? `${raw.Make} ${raw.Model}` : undefined,
        lens: raw?.LensModel,
        exifPayload,
      };
    } catch (error) {
      console.warn('Failed to extract EXIF data:', error);
      return {};
    }
  };

  const findNearestManhole = useCallback((lat: number, lng: number): Manhole | undefined => {
    if (!manholes.length) return undefined;

    let nearest: Manhole | undefined;
    let minDistance = Infinity;

    manholes.forEach(manhole => {
      if (manhole.latitude != null && manhole.longitude != null) {
        const distance = calculateDistance(lat, lng, manhole.latitude, manhole.longitude);
        if (distance < minDistance && distance <= MAX_DISTANCE_KM) { // 50m以内
          minDistance = distance;
          nearest = manhole;
        }
      }
    });

    return nearest;
  }, [manholes]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // 1枚のみ: 新しく選んだ写真で置き換える（/design-manholes/new と同じ挙動）
    const file = acceptedFiles[0];
    if (!file) return;

    setLoading(true);

    // 既存の選択は破棄してプレビューURLを解放
    setPhotos(prev => {
      prev.forEach(p => URL.revokeObjectURL(p.preview));
      return [];
    });

    const id = Math.random().toString(36).substring(2, 11);
    const preview = URL.createObjectURL(file);
    const metadata = await extractMetadata(file);

    let matchedManhole: Manhole | undefined;
    let distanceError: string | undefined;
    let photoStatus: 'waiting_manhole' | 'invalid_gps' | 'no_nearby_manhole' | 'valid';

    // ✅ GPS座標の必須チェック
    if (!isValidCoordinates(metadata.latitude, metadata.longitude)) {
      distanceError = 'GPS座標が見つかりません。写真の位置情報を有効にしてください。';
      photoStatus = 'invalid_gps';
    } else if (manholes.length > 0) { // マンホール一覧が利用可能な場合のみ判定
      // isValidCoordinates が true の場合、lat/lng は有効な数値
      matchedManhole = findNearestManhole(
        metadata.latitude as number,
        metadata.longitude as number
      );
      if (matchedManhole) {
        photoStatus = 'valid';
      } else {
        distanceError = '50m以内にマンホールが見つかりません。位置情報を確認してください。';
        photoStatus = 'no_nearby_manhole';
      }
    } else {
      distanceError = 'マンホール情報をロード中です。少々お待ちください。';
      photoStatus = 'waiting_manhole';
    }

    setPhotos([{
      id,
      file,
      preview,
      metadata,
      matchedManhole,
      uploading: false,
      uploaded: false,
      error: distanceError,
      photoStatus
    }]);

    // 画像メタ情報からnoteのデフォルト値を生成
    const noteLines = [];
    if (metadata.camera) noteLines.push(`カメラ: ${metadata.camera}`);
    if (metadata.lens) noteLines.push(`レンズ: ${metadata.lens}`);
    if (metadata.datetime) {
      const date = new Date(metadata.datetime);
      noteLines.push(`撮影日時: ${date.toLocaleString('ja-JP')}`);
    }
    if (metadata.latitude && metadata.longitude) {
      noteLines.push(`位置: ${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`);
    }
    // マッチしたマンホールとの距離を追加
    if (matchedManhole && metadata.latitude && metadata.longitude && matchedManhole.latitude && matchedManhole.longitude) {
      const distance = calculateDistance(
        metadata.latitude,
        metadata.longitude,
        matchedManhole.latitude,
        matchedManhole.longitude
      );
      const distanceM = Math.round(distance * 1000); // kmをmに変換
      noteLines.push(`マンホールまでの距離: 約${distanceM}m`);
    }
    if (noteLines.length > 0) {
      setVisitNote(noteLines.join('\n'));
    }

    setLoading(false);
  }, [manholes]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.heic', '.heif']
    },
    maxFiles: 1,
    multiple: false
  });

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.preview);
      }
      return prev.filter(p => p.id !== id);
    });
  };

  const uploadPhoto = async (photoId: string): Promise<void> => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    const notify = (type: 'error' | 'success', message: string) => {
      addAlert(type, message);
    };

    // ✅ GPS座標の必須チェック
    if (!isValidCoordinates(photo.metadata.latitude, photo.metadata.longitude)) {
      const errorMsg = 'GPS座標が見つかりません。写真の位置情報を有効にしてください。';
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          error: errorMsg
        } : p
      ));
      notify('error', errorMsg);
      return;
    }

    // ✅ マンホールが選択されているかチェック
    if (!photo.matchedManhole) {
      const errorMsg = 'マンホールが見つかりません。別の写真を試してください。';
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          error: errorMsg
        } : p
      ));
      notify('error', errorMsg);
      return;
    }

    // ✅ マンホール位置との距離チェック（50m以内）
    if (
      photo.matchedManhole.latitude == null ||
      photo.matchedManhole.longitude == null
    ) {
      const errorMsg = 'マンホール位置情報が見つかりません。別の写真を試してください。';
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          error: errorMsg
        } : p
      ));
      notify('error', errorMsg);
      return;
    }

    const distance = calculateDistance(
      photo.metadata.latitude as number,
      photo.metadata.longitude as number,
      photo.matchedManhole.latitude,
      photo.matchedManhole.longitude
    );

    if (distance > MAX_DISTANCE_KM) {
      const distanceM = Math.round(distance * 1000);
      const errorMsg = `マンホール位置から${distanceM}m離れています。50m以内で撮影した写真を登録してください。`;
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          error: errorMsg
        } : p
      ));
      notify('error', errorMsg);
      return;
    }

    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, uploading: true, error: undefined } : p
    ));

    try {
      const uploadStartTime = Date.now();

      // Compress image
      const compressedFile = await imageCompression(photo.file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      });

      trackPhotoUploadStart({ is_logged_in: true });

      // Prepare form data for upload
      const formData = new FormData();
      formData.append('file', compressedFile);

      // Add manhole ID if matched
      if (photo.matchedManhole) {
        formData.append('manhole_id', photo.matchedManhole.id.toString());
      }

      // Add visit metadata
      formData.append('shot_at', photo.metadata.datetime || new Date().toISOString());

      // Add location data if available (0も有効値なのでisValidCoordinatesで判定)
      if (isValidCoordinates(photo.metadata.latitude, photo.metadata.longitude)) {
        formData.append('latitude', String(photo.metadata.latitude));
        formData.append('longitude', String(photo.metadata.longitude));
      }

      // Add note (個人メモ) if provided
      if (visitNote.trim()) {
        formData.append('note', visitNote.trim());
      }

      // Add comment if provided
      if (visitComment.trim()) {
        formData.append('comment', visitComment.trim());
      }

      // Add is_public setting
      formData.append('is_public', isPublic.toString());

      if (photo.metadata.exifPayload) {
        formData.append('exif', JSON.stringify(photo.metadata.exifPayload));
      }

      // Upload to binary storage API
      const uploadResponse = await fetch('/api/image-upload', {
        method: 'POST',
        body: formData
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      const manholeParams = {
        manhole_id: photo.matchedManhole?.id,
        prefecture: photo.matchedManhole?.prefecture,
        is_logged_in: true,
        upload_duration_ms: Date.now() - uploadStartTime,
        has_location: isValidCoordinates(photo.metadata.latitude, photo.metadata.longitude),
        has_note: !!visitNote.trim(),
        is_public: isPublic,
      };
      trackPhotoUploadComplete(manholeParams);
      trackVisitRegister(manholeParams);

      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          uploading: false,
          uploaded: true,
          uploadedImageId: uploadResult.image.id
        } : p
      ));
      // 成功時は完了画面に切り替わるためアラートは出さない
    } catch (error: any) {
      console.error('Upload failed:', error);

      const errorType = (() => {
        if (error?.status === 401 || error?.message?.includes('Unauthorized')) return 'unauthorized';
        if (error?.name === 'TypeError' || error?.message?.includes('network')) return 'network';
        if (error?.message?.includes('size') || error?.message?.includes('large')) return 'file_size';
        if (error?.message?.includes('GPS') || error?.message?.includes('location')) return 'gps_validation';
        return 'unknown';
      })();
      trackAppError('upload_error', errorType);

      const errorMsg = error?.message || 'アップロードに失敗しました';
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          uploading: false,
          error: errorMsg
        } : p
      ));
      notify('error', `登録失敗: ${errorMsg}`);
      return;
    }
  };

  const handleSubmit = async () => {
    const target = photos.find(p => !p.uploaded && !p.uploading);
    if (target) await uploadPhoto(target.id);
  };

  const captureFromCamera = () => {
    // カメラ入力用のinput要素を作成してトリガー
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // 背面カメラを優先

    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        await onDrop(Array.from(target.files));
      }
    };

    input.click();
  };

  // 全枚数の登録が完了したら専用の完了画面へ（/design-manholes/new と同じUX）
  const allUploaded = photos.length > 0 && photos.every(p => p.uploaded);

  if (allUploaded) {
    return (
      <div className="min-h-screen safe-area-inset bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
        <Header title="写真を投稿" />
        <main className="mx-auto max-w-2xl px-4 pb-8 pt-10 text-center">
          <CheckCircle className="mx-auto h-14 w-14 text-[#4C9A57]" />
          <h1 className="mt-4 text-xl font-bold">投稿ありがとうございます！</h1>
          <p className="mt-2 text-sm text-[#2A2A2A]/70">
            写真を訪問記録に登録しました。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/visits"
              className="rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
            >
              訪問記録を見る
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
      {/* ✅ アラートバナー */}
      {alerts.length > 0 && (
        <div className="fixed left-0 right-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[60] space-y-2 px-4 pb-4">
          {alerts.map(alert => (
            <div
              key={alert.id}
              role={alert.type === 'success' ? 'status' : 'alert'}
              aria-live={alert.type === 'success' ? 'polite' : 'assertive'}
              aria-atomic="true"
              className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
                alert.type === 'error'
                  ? 'border-[#B5483C]/40 bg-[#FBEAE8] text-[#B5483C]'
                  : alert.type === 'success'
                  ? 'border-[#4C9A57]/40 bg-[#EAF4EC] text-[#3C7A46]'
                  : 'border-[#B07818]/40 bg-[#FAF0DC] text-[#8A5E10]'
              }`}
            >
              <div className="flex items-center gap-2">
                {alert.type === 'error' && <AlertCircle className="w-5 h-5" />}
                {alert.type === 'success' && <CheckCircle className="w-5 h-5" />}
                {alert.type === 'warning' && <AlertCircle className="w-5 h-5" />}
                <span>{alert.message}</span>
              </div>
              <button
                onClick={() => removeAlert(alert.id)}
                className="hover:opacity-70"
                aria-label="アラートを閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Header title="写真を投稿" />

      <main className="mx-auto max-w-2xl px-4 pb-8 pt-5 sm:pt-8">
        <p className="rounded-lg border border-[#7B63A8]/15 bg-white/70 p-3 text-sm leading-relaxed text-[#2A2A2A]/80">
          ポケふたの写真を投稿すると、訪問記録として図鑑に掲載されます。
          GPS位置情報付きの写真（マンホールから50m以内）が必須です。
        </p>
        <p className="mt-2 text-right text-xs">
          <Link href="/design-manholes/new" className="text-[#7B63A8] underline hover:opacity-80">
            ポケふた以外のデザインマンホールの投稿はこちら →
          </Link>
        </p>

        {/* Hint Manhole Card */}
        {hintManhole && (
          <section className="mt-4 rounded-lg border border-[#7B63A8]/20 bg-white/70 p-3">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <MapPin className="h-4 w-4 flex-shrink-0 text-[#7B63A8]" />
              撮影対象マンホール
            </div>
            <p className="mt-1 text-sm">
              {hintManhole.name}（{hintManhole.prefecture} {hintManhole.city}）
            </p>
            <p className="mt-1 text-xs text-[#2A2A2A]/60">
              写真をアップロードすると、GPS位置でマンホールを確認します
            </p>
          </section>
        )}

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
            <Upload className={`mx-auto mb-2 h-10 w-10 ${isDragActive ? 'text-[#7B63A8]' : 'text-[#7B63A8]/50'}`} />
            <p className="text-sm text-[#2A2A2A]/60">
              {isDragActive ? '写真をドロップ！' : 'タップして写真を選択（またはドラッグ&ドロップ）'}
            </p>
            <p className="mt-1 text-xs text-[#2A2A2A]/50">
              JPEG, PNG, HEIC形式に対応
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
          </div>
          <p className="mt-2 text-xs text-[#2A2A2A]/60">
            できるだけ「真上から・マンホール全体（ふたの縁まで）が入る」写真だと、とても助かります。
          </p>
          {loading && (
            <p className="mt-2 text-sm text-[#7B63A8]">写真を読み込み中...</p>
          )}
        </section>

        {/* 撮影のコツ */}
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
            📍 <strong>GPS位置情報は必須です。</strong> 写真の位置情報を有効にしてアップロードしてください。マンホール位置から50m以内の写真のみ登録できます。
          </p>

          <div className="mt-3 space-y-1 text-xs text-[#2A2A2A]/60">
            <p>過去に撮った写真も登録できます。ただしトップページは日付順に並ぶため、昔の日付で登録すると下の方に表示されます。</p>
            <p>同じポケふたに複数の写真を登録できます（別角度・別日・アップなど）。あとから追加登録もOKです。</p>
            <p>いい写真が撮れたら、ぜひ新規投稿して図鑑を盛り上げてください。</p>
          </div>
        </details>

        {/* Photos List */}
        {photos.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-bold">
              選択した写真
            </h2>
            <p className="mt-1 text-xs text-[#2A2A2A]/60">
              コメント・公開設定は下で入力できます。
            </p>

            <div className="mt-2 space-y-3">
              {photos.map((photo) => (
                <div key={photo.id} className="rounded-lg border border-[#7B63A8]/15 bg-white/70 p-3">
                  <div className="flex gap-3">
                    {/* Photo Preview */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.preview}
                      alt="選択した写真のプレビュー"
                      className="h-20 w-20 flex-shrink-0 rounded-lg object-cover"
                    />

                    {/* Photo Info */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-xs font-bold">
                          {photo.file.name}
                        </h3>
                        {!photo.uploaded && !photo.uploading && (
                          <button
                            onClick={() => removePhoto(photo.id)}
                            className="text-[#B5483C] transition hover:opacity-70"
                            aria-label="この写真を削除"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Location Info */}
                      {photo.metadata.latitude && photo.metadata.longitude ? (
                        <div className="flex items-center gap-1 text-xs text-[#2A2A2A]/60">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">
                            {photo.metadata.latitude.toFixed(4)}, {photo.metadata.longitude.toFixed(4)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-[#2A2A2A]/50">位置情報なし</p>
                      )}

                      {/* Matched Manhole */}
                      {photo.matchedManhole && (() => {
                        const isHintMatch = hintManhole && photo.matchedManhole!.id === hintManhole.id;
                        const isHintMismatch = hintManhole && photo.matchedManhole!.id !== hintManhole.id;
                        return (
                          <div className={`rounded-lg border p-2 ${isHintMismatch ? 'border-[#B07818]/40 bg-[#B07818]/10' : 'border-[#4C9A57]/40 bg-[#4C9A57]/10'}`}>
                            <div className={`flex items-center gap-1 text-xs font-bold ${isHintMismatch ? 'text-[#8A5E10]' : 'text-[#4C9A57]'}`}>
                              <CheckCircle className="w-3 h-3" />
                              <span>{isHintMatch ? 'ヒント一致!' : isHintMismatch ? '別のマンホールが検出されました' : 'マンホール検出!'}</span>
                            </div>
                            <p className="mt-1 text-xs">
                              {photo.matchedManhole!.name} ({photo.matchedManhole!.city})
                              {isValidCoordinates(photo.metadata.latitude, photo.metadata.longitude) &&
                                photo.matchedManhole!.latitude != null &&
                                photo.matchedManhole!.longitude != null && (
                                <span className="text-[#2A2A2A]/50">
                                  {' '}・約{Math.round(calculateDistance(
                                    photo.metadata.latitude as number,
                                    photo.metadata.longitude as number,
                                    photo.matchedManhole!.latitude,
                                    photo.matchedManhole!.longitude
                                  ) * 1000)}m
                                </span>
                              )}
                            </p>
                          </div>
                        );
                      })()}

                      {/* Upload Status */}
                      <div className="pt-1">
                        {photo.uploaded && (
                          <div className="flex items-center gap-1 text-xs text-[#4C9A57]">
                            <CheckCircle className="w-4 h-4" />
                            <span>登録完了</span>
                          </div>
                        )}
                        {photo.uploading && (
                          <p className="text-xs text-[#7B63A8]">登録中...</p>
                        )}
                        {photo.error && (
                          <div className="text-xs text-[#B5483C]">
                            <div className="flex items-center gap-1">
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                              <span>{photo.error}</span>
                            </div>
                            {photo.photoStatus === 'no_nearby_manhole' && (
                              <Link
                                href="/design-manholes/new"
                                className="mt-1 inline-block font-bold underline hover:opacity-80"
                              >
                                ポケふた以外のマンホールなら → デザインマンホール投稿へ
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* コメント・公開設定・個人メモ */}
            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="up-comment" className="text-sm font-bold">
                  訪問コメント <span className="text-xs font-normal text-[#2A2A2A]/50">（任意）</span>
                </label>
                <p className="mt-0.5 text-xs text-[#2A2A2A]/60">
                  公開設定がONの場合、他のユーザーも閲覧できます
                </p>
                <textarea
                  id="up-comment"
                  className="mt-1.5 w-full rounded-lg border border-[#7B63A8]/20 bg-white px-3 py-2.5 text-sm focus:border-[#7B63A8] focus:outline-none"
                  placeholder="このポケふたの感想を書こう！例: ピカチュウのデザインがかわいい！"
                  rows={3}
                  value={visitComment}
                  onChange={(e) => setVisitComment(e.target.value)}
                  maxLength={500}
                />
                <p className="mt-1 text-right text-xs text-[#2A2A2A]/50">
                  {visitComment.length}/500文字
                </p>
              </div>

              {/* 公開設定 */}
              <div className="flex items-center justify-between rounded-lg border border-[#7B63A8]/15 bg-white/70 p-3">
                <div>
                  <h3 className="text-sm font-bold">公開設定</h3>
                  <p className="mt-0.5 text-xs text-[#2A2A2A]/60">
                    {isPublic ? '他のユーザーも閲覧できます' : '自分だけが閲覧できます'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newValue = !isPublic;
                    setIsPublic(newValue);
                    setCookie('pokefuta_is_public', newValue.toString());
                  }}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    isPublic ? 'bg-[#7B63A8]' : 'bg-[#2A2A2A]/25'
                  }`}
                  aria-label="公開設定を切り替える"
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      isPublic ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label htmlFor="up-note" className="text-sm font-bold">
                  個人メモ <span className="text-xs font-normal text-[#2A2A2A]/50">（任意・非公開）</span>
                </label>
                <p className="mt-0.5 text-xs text-[#2A2A2A]/60">
                  カメラ情報など、自分だけが見るメモです（公開設定に関わらず非公開）
                </p>
                <textarea
                  id="up-note"
                  className="mt-1.5 w-full rounded-lg border border-[#7B63A8]/20 bg-white px-3 py-2.5 text-sm focus:border-[#7B63A8] focus:outline-none"
                  placeholder="例: カメラ: iPhone 15 Pro&#10;レンズ: 広角&#10;撮影日時: 2025/10/20 15:30"
                  rows={4}
                  value={visitNote}
                  onChange={(e) => setVisitNote(e.target.value)}
                  maxLength={1000}
                />
                <p className="mt-1 text-right text-xs text-[#2A2A2A]/50">
                  {visitNote.length}/1000文字
                </p>
              </div>
            </div>

            {/* 送信 */}
            <div className="mt-6">
              <button
                onClick={handleSubmit}
                className="w-full rounded-lg bg-[#7B63A8] py-3 text-sm font-bold text-white transition hover:bg-[#6A5299] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={photos.every(p => p.uploaded || p.uploading)}
              >
                {photos.some(p => p.uploading) ? '登録中...' : '訪問記録を登録する'}
              </button>
              <p className="mt-2 text-center text-xs text-[#2A2A2A]/50">
                公開設定がONの写真・コメントはすぐに公開されます。
              </p>
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6EEDC] flex items-center justify-center">
          <span className="text-sm text-[#7B63A8]">読み込み中...</span>
        </div>
      }
    >
      <UploadPageInner />
    </Suspense>
  );
}
