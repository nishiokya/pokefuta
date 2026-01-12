'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, Upload, MapPin, CheckCircle, AlertCircle, X, Navigation, History, Home } from 'lucide-react';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';

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
}

export default function UploadPage() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [manholes, setManholes] = useState<Manhole[]>([]);
  const [loading, setLoading] = useState(false);
  const [visitNote, setVisitNote] = useState<string>(''); // 個人メモ（非公開）
  const [visitComment, setVisitComment] = useState<string>(''); // 訪問コメント
  const [isPublic, setIsPublic] = useState<boolean>(true); // 公開設定（デフォルト: 公開）
  const [tutorialImageError, setTutorialImageError] = useState(false);

  useEffect(() => {
    // ページタイトル設定
    document.title = '写真登録 - ポケふた訪問記録';

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

  const findNearestManhole = (lat: number, lng: number): Manhole | undefined => {
    if (!manholes.length) return undefined;

    let nearest: Manhole | undefined;
    let minDistance = Infinity;

    manholes.forEach(manhole => {
      if (manhole.latitude && manhole.longitude) {
        const distance = calculateDistance(lat, lng, manhole.latitude, manhole.longitude);
        if (distance < minDistance && distance < 0.1) { // Within 100m
          minDistance = distance;
          nearest = manhole;
        }
      }
    });

    return nearest;
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setLoading(true);

    const newPhotos: UploadedPhoto[] = [];

    for (const file of acceptedFiles) {
      const id = Math.random().toString(36).substring(2, 11);
      const preview = URL.createObjectURL(file);
      const metadata = await extractMetadata(file);

      let matchedManhole: Manhole | undefined;
      if (metadata.latitude && metadata.longitude) {
        matchedManhole = findNearestManhole(metadata.latitude, metadata.longitude);
      }

      newPhotos.push({
        id,
        file,
        preview,
        metadata,
        matchedManhole,
        uploading: false,
        uploaded: false
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

    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, uploading: true, error: undefined } : p
    ));

    try {
      // Compress image
      console.log('Starting image compression for:', photo.file.name, 'Size:', photo.file.size);
      const compressedFile = await imageCompression(photo.file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      });
      console.log('Image compressed successfully. New size:', compressedFile.size);

      // Prepare form data for upload
      const formData = new FormData();
      formData.append('file', compressedFile);

      // Add manhole ID if matched
      if (photo.matchedManhole) {
        formData.append('manhole_id', photo.matchedManhole.id.toString());
      }

      // Add visit metadata
      formData.append('shot_at', photo.metadata.datetime || new Date().toISOString());

      // Add location data if available
      if (photo.metadata.latitude && photo.metadata.longitude) {
        formData.append('latitude', photo.metadata.latitude.toString());
        formData.append('longitude', photo.metadata.longitude.toString());
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
      console.log('Uploading to /api/image-upload...');
      const uploadResponse = await fetch('/api/image-upload', {
        method: 'POST',
        body: formData
      });

      console.log('Upload response status:', uploadResponse.status);
      const uploadResult = await uploadResponse.json();
      console.log('Upload result:', uploadResult);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          uploading: false,
          uploaded: true,
          uploadedImageId: uploadResult.image.id
        } : p
      ));

    } catch (error: any) {
      console.error('Upload failed:', error);
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? {
          ...p,
          uploading: false,
          error: error?.message || 'アップロードに失敗しました'
        } : p
      ));
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
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-rpg-bgDark">
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
              <div className="font-pixelJp text-rpg-textGold">
                処理中<span className="rpg-loading"></span>
              </div>
            </div>
          )}
        </div>

        <div className="rpg-window">
          <h3 className="font-pixelJp text-sm text-rpg-textDark font-bold mb-2">OK/NG（チュートリアル）</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <div className="border-2 border-rpg-border bg-rpg-bgLight p-2">
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

            <div className="border-2 border-rpg-border bg-rpg-bgLight p-2">
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
            位置情報が入っている写真は、候補の絞り込みがスムーズになります（なくても登録できます）。
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

          {!tutorialImageError && (
            <div className="mt-4 border-2 border-rpg-border bg-rpg-bgDark overflow-hidden max-w-md mx-auto">
              <Image
                src="/asset/tutorial_manhole.jpg"
                alt="マンホール撮影のチュートリアル例"
                width={2500}
                height={2657}
                className="w-full h-auto"
                priority={false}
                onError={() => {
                  console.error('Failed to load tutorial image');
                  setTutorialImageError(true);
                }}
              />
            </div>
          )}
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
                        className="w-20 h-20 object-cover border-2 border-rpg-border"
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
                  className="w-full p-3 border-2 border-rpg-border rounded font-pixelJp text-sm"
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
                <div className="mt-4 pt-4 border-t-2 border-rpg-border">
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
                  className="w-full p-3 border-2 border-rpg-border rounded font-pixelJp text-sm"
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
                <div className="mt-4 pt-4 border-t-2 border-rpg-border">
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