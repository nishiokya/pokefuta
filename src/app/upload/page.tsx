'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';
import { Camera, Upload, MapPin, CheckCircle, AlertCircle, X, Navigation, History, Home } from 'lucide-react';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import { calculateDistance, isValidCoordinates, MAX_DISTANCE_KM } from '@/lib/location';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

interface PhotoMetadata {
  latitude?: number;
  longitude?: number;
  datetime?: string;
  camera?: string;
  lens?: string;
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

export default function UploadPage() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [manholes, setManholes] = useState<Manhole[]>([]);
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
    trackView('/upload', '写真登録', 'upload');

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
      const metadata = await exifr.parse(file);
      return {
        latitude: metadata?.latitude,
        longitude: metadata?.longitude,
        datetime: metadata?.DateTimeOriginal || metadata?.DateTime,
        camera: metadata?.Make && metadata?.Model ? `${metadata.Make} ${metadata.Model}` : undefined,
        lens: metadata?.LensModel
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
    setLoading(true);

    const newPhotos: UploadedPhoto[] = [];

    for (const file of acceptedFiles) {
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

      newPhotos.push({
        id,
        file,
        preview,
        metadata,
        matchedManhole,
        uploading: false,
        uploaded: false,
        error: distanceError,
        photoStatus
      });

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
    }

    // Replace existing photo with the new one (only 1 photo allowed)
    setPhotos(newPhotos);
    setLoading(false);
  }, [manholes]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.heic', '.heif']
    },
    multiple: false,
    maxFiles: 1
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

  const uploadPhoto = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    // ✅ GA: 検証・圧縮・アップロードを含む全体処理の開始時刻を記録
    const uploadStartTime = Date.now();

    // ✅ GPS座標の必須チェック
    if (!isValidCoordinates(photo.metadata.latitude, photo.metadata.longitude)) {
      const errorMsg = 'GPS座標が見つかりません。写真の位置情報を有効にしてください。';
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          error: errorMsg
        } : p
      ));
      addAlert('error', errorMsg);
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
      addAlert('error', errorMsg);
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
      addAlert('error', errorMsg);
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
      addAlert('error', errorMsg);
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

      // Add metadata
      const metadata = {
        metadata: {
          ...photo.metadata,
          originalFilename: photo.file.name,
          uploadedAt: new Date().toISOString()
        },
        exif: photo.metadata
      };
      formData.append('metadata', JSON.stringify(metadata));

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
      addAlert('success', '訪問記録を登録しました！');

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
      addAlert('error', `登録失敗: ${errorMsg}`);
    }
  };

  const uploadAllPhotos = async () => {
    const unuploadedPhotos = photos.filter(p => !p.uploaded && !p.uploading);
    for (const photo of unuploadedPhotos) {
      await uploadPhoto(photo.id);
    }
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

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC]">
      {/* ✅ アラートバナー */}
      {alerts.length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 space-y-2 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          {alerts.map(alert => (
            <div
              key={alert.id}
              role={alert.type === 'success' ? 'status' : 'alert'}
              aria-live={alert.type === 'success' ? 'polite' : 'assertive'}
              aria-atomic="true"
              className={`flex items-center justify-between gap-2 p-3 rounded-lg border-2 font-pixelJp text-sm animate-bounce motion-reduce:animate-none ${
                alert.type === 'error'
                  ? 'bg-rpg-red/20 border-rpg-red text-rpg-red'
                  : alert.type === 'success'
                  ? 'bg-rpg-green/20 border-rpg-green text-rpg-green'
                  : 'bg-rpg-yellow/20 border-rpg-yellow text-rpg-yellow'
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

      <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
        <div className="rpg-window">
          <h2 className="font-pixelJp text-sm text-rpg-textDark font-bold mb-1">撮影のコツ</h2>
          <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
            できるだけ「真上から・マンホール全体（ふたの縁まで）が入る」写真だと、とても助かります。
          </p>
        </div>

        {/* Upload Area */}
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`rpg-window cursor-pointer transition-all ${
              isDragActive ? 'bg-rpg-yellow/20 border-rpg-yellow' : ''
            }`}
          >
            <input {...getInputProps()} />
            <div className="text-center py-8">
              <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragActive ? 'text-rpg-yellow' : 'text-rpg-blue'}`} />
              <p className="font-pixelJp text-lg text-rpg-textDark mb-2">
                {isDragActive ? '写真をドロップ!' : '写真を1枚選択またはドロップ'}
              </p>
              <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mb-4">
                JPEG, PNG, HEIC形式に対応
              </p>
              <div className="flex gap-2 justify-center">
                <button className="rpg-button text-xs">
                  <span className="font-pixelJp">ファイル選択</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    captureFromCamera();
                  }}
                  className="rpg-button rpg-button-success text-xs flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span className="font-pixelJp">カメラ</span>
                </button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="text-center py-4">
              <div className="font-pixelJp text-[#7B63A8]">
                処理中<span className="rpg-loading"></span>
              </div>
            </div>
          )}
        </div>

        <div className="rpg-window">
          <h3 className="font-pixelJp text-sm text-rpg-textDark font-bold mb-2">チュートリアル: OK/NG</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <div className="border border-[#7B63A8]/15 bg-white/70 p-2">
              <div className="flex items-center gap-1 font-pixelJp text-xs text-rpg-green mb-1">
                <CheckCircle className="w-3 h-3" />
                <span>OK</span>
              </div>
              <ul className="space-y-1 font-pixelJp text-xs text-rpg-textDark opacity-80">
                <li>・マンホール全体が入っている</li>
                <li>・真上に近い角度で撮れている</li>
                <li>・絵柄や文字がはっきり見える</li>
              </ul>
            </div>

            <div className="border border-[#7B63A8]/15 bg-white/70 p-2">
              <div className="flex items-center gap-1 font-pixelJp text-xs text-rpg-red mb-1">
                <AlertCircle className="w-3 h-3" />
                <span>NG</span>
              </div>
              <ul className="space-y-1 font-pixelJp text-xs text-rpg-textDark opacity-80">
                <li>・斜めすぎて歪んでいる</li>
                <li>・反射/影で見えにくい</li>
                <li>・暗い/ブレている</li>
              </ul>
            </div>
          </div>

          <p className="font-pixelJp text-[10px] text-rpg-textDark opacity-60 mt-2">
            📍 <strong>GPS位置情報は必須です。</strong> 写真の位置情報を有効にしてアップロードしてください。マンホール位置から50m以内の写真のみ登録できます。
          </p>

          <div className="mt-3 space-y-1">
            <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
              過去に撮った写真も登録できます。ただしトップページは日付順に並ぶため、昔の日付で登録すると下の方に表示されます。
            </p>
            <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
              同じポケふたに複数の写真を登録できます（別角度・別日・アップなど）。あとから追加登録もOKです。
            </p>
            <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
              いい写真が撮れたら、ぜひ新規投稿して図鑑を盛り上げてください。
            </p>
          </div>

        </div>

        {/* Photos List */}
        {photos.length > 0 && (
          <div className="space-y-4">
            <div className="rpg-window">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-pixelJp text-sm text-rpg-textDark font-bold">
                  選択済み写真
                </h2>
                <button
                  onClick={uploadAllPhotos}
                  className="rpg-button rpg-button-primary text-xs"
                  disabled={photos.every(p => p.uploaded || p.uploading)}
                >
                  <span className="font-pixelJp">登録</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {photos.map((photo) => (
                <div key={photo.id} className="rpg-window">
                  <div className="flex gap-3">
                    {/* Photo Preview */}
                    <div className="flex-shrink-0">
                      <img
                        src={photo.preview}
                        alt="Preview"
                        className="w-20 h-20 object-cover border border-[#7B63A8]/15"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>

                    {/* Photo Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-pixelJp text-xs text-rpg-textDark font-bold truncate">
                          {photo.file.name}
                        </h3>
                        <button
                          onClick={() => removePhoto(photo.id)}
                          className="text-rpg-red hover:opacity-70"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Location Info */}
                      {photo.metadata.latitude && photo.metadata.longitude ? (
                        <div className="flex items-center gap-1 font-pixelJp text-xs text-rpg-textDark opacity-70">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">
                            {photo.metadata.latitude.toFixed(4)}, {photo.metadata.longitude.toFixed(4)}
                          </span>
                        </div>
                      ) : (
                        <p className="font-pixelJp text-xs text-rpg-textDark opacity-50">位置情報なし</p>
                      )}

                      {/* Matched Manhole */}
                      {photo.matchedManhole && (
                        <div className="bg-rpg-green/20 border-2 border-rpg-green p-2">
                          <div className="flex items-center gap-1 font-pixelJp text-xs text-rpg-green">
                            <CheckCircle className="w-3 h-3" />
                            <span>マンホール検出!</span>
                          </div>
                          <p className="font-pixelJp text-xs text-rpg-textDark mt-1">
                            {photo.matchedManhole.name} ({photo.matchedManhole.city})
                          </p>
                        </div>
                      )}

                      {/* Upload Status */}
                      <div className="pt-2">
                        {photo.uploaded && (
                          <div className="flex items-center gap-1 text-rpg-green">
                            <CheckCircle className="w-4 h-4" />
                            <span className="font-pixelJp text-xs">登録完了</span>
                          </div>
                        )}
                        {photo.uploading && (
                          <div className="flex items-center gap-2">
                            <div className="rpg-loading inline-block"></div>
                            <span className="font-pixelJp text-xs text-rpg-textDark">登録中...</span>
                          </div>
                        )}
                        {photo.error && (
                          <div className="flex items-center gap-1 text-rpg-red">
                            <AlertCircle className="w-4 h-4" />
                            <span className="font-pixelJp text-xs">{photo.error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* コメント入力欄 */}
            {photos.length > 0 && (
              <div className="rpg-window mt-4">
                <h3 className="rpg-window-title text-sm mb-2">訪問コメント（任意）</h3>
                <p className="text-xs text-rpg-textDark opacity-70 font-pixelJp mb-2">
                  公開設定がONの場合、他のユーザーも閲覧できます
                </p>
                <textarea
                  className="w-full p-3 border border-[#7B63A8]/15 rounded font-pixelJp text-sm"
                  placeholder="このポケふたの感想を書こう！例: ピカチュウのデザインがかわいい！"
                  rows={3}
                  value={visitComment}
                  onChange={(e) => setVisitComment(e.target.value)}
                  maxLength={500}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-rpg-textDark opacity-70 font-pixelJp">
                    {visitComment.length}/500文字
                  </p>
                </div>

                {/* 公開設定 */}
                <div className="mt-4 pt-4 border-t border-[#7B63A8]/15">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-pixelJp text-sm text-rpg-textDark mb-1">公開設定</h4>
                      <p className="text-xs text-rpg-textDark opacity-70 font-pixelJp">
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
                        isPublic ? 'bg-rpg-primary' : 'bg-gray-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          isPublic ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 個人メモ入力欄 */}
            {photos.length > 0 && (
              <div className="rpg-window mt-4">
                <h3 className="rpg-window-title text-sm mb-2">
                  個人メモ（任意・非公開）
                </h3>
                <p className="text-xs text-rpg-textDark opacity-70 font-pixelJp mb-2">
                  カメラ情報など、自分だけが見るメモです
                </p>
                <textarea
                  className="w-full p-3 border border-[#7B63A8]/15 rounded font-pixelJp text-sm"
                  placeholder="例: カメラ: iPhone 15 Pro&#10;レンズ: 広角&#10;撮影日時: 2025/10/20 15:30"
                  rows={4}
                  value={visitNote}
                  onChange={(e) => setVisitNote(e.target.value)}
                  maxLength={1000}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-rpg-textDark opacity-70 font-pixelJp">
                    {visitNote.length}/1000文字
                  </p>
                  <p className="text-xs text-rpg-textDark opacity-70 font-pixelJp">
                    ※ is_publicの設定に関わらず非公開
                  </p>
                </div>

                {/* 登録ボタン */}
                <div className="mt-4 pt-4 border-t border-[#7B63A8]/15">
                  {photos.some(p => !p.uploaded && !p.uploading) && (
                    <button
                      onClick={uploadAllPhotos}
                      className="rpg-button w-full py-3 text-base"
                      disabled={photos.every(p => p.uploaded || p.uploading)}
                    >
                      <Upload className="w-5 h-5 inline mr-2" />
                      <span className="font-pixelJp">訪問記録を登録</span>
                    </button>
                  )}
                  {photos.some(p => p.uploaded) && (
                    <div className="mt-2 p-3 bg-rpg-success bg-opacity-20 border-2 border-rpg-success rounded">
                      <div className="flex items-center gap-2 text-rpg-success font-pixelJp text-sm">
                        <CheckCircle className="w-5 h-5" />
                        <span>登録完了しました！</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
