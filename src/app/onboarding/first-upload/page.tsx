'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter, useSearchParams } from 'next/navigation';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import {
  Camera,
  Upload,
  MapPin,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  Compass,
  Target,
} from 'lucide-react';
import { Manhole } from '@/types/database';

interface PhotoMetadata {
  latitude?: number;
  longitude?: number;
  shotAt?: string;
  camera?: string;
}

interface PendingPhoto {
  file: File;
  preview: string;
  metadata: PhotoMetadata;
}

const formatManholeLabel = (manhole: Manhole) =>
  `${manhole.prefecture}${manhole.municipality || ''}・${manhole.title || manhole.name || 'ポケふた'}`;

export default function FirstUploadOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('next') || '/map';

  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const [candidateManholes, setCandidateManholes] = useState<Manhole[]>([]);
  const [selectedManholeId, setSelectedManholeId] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [allManholes, setAllManholes] = useState<Manhole[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [state, setState] = useState<'idle' | 'analyzing' | 'ready' | 'uploading' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  const manualResults = useMemo(() => {
    if (!manualQuery.trim()) return [];
    const keyword = manualQuery.toLowerCase();
    return allManholes
      .filter((manhole) => {
        const text = [
          manhole.title,
          manhole.prefecture,
          manhole.municipality,
          (manhole.pokemons || []).join(','),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(keyword);
      })
      .slice(0, 12);
  }, [allManholes, manualQuery]);

  useEffect(() => {
    return () => {
      if (photo?.preview) {
        URL.revokeObjectURL(photo.preview);
      }
    };
  }, [photo?.preview]);

  const loadManholeCatalog = useCallback(async () => {
    if (allManholes.length > 0 || manualLoading) return;
    try {
      setManualLoading(true);
      const response = await fetch('/api/manholes?limit=2000');
      if (response.ok) {
        const payload = await response.json();
        if (payload.success && Array.isArray(payload.manholes)) {
          setAllManholes(payload.manholes);
        }
      }
    } catch (catalogError) {
      console.error('Failed to load manhole catalog:', catalogError);
    } finally {
      setManualLoading(false);
    }
  }, [allManholes.length, manualLoading]);

  const fetchNearbyManholes = useCallback(async (lat: number, lng: number) => {
    try {
      setState('analyzing');
      const response = await fetch(`/api/manholes?lat=${lat}&lng=${lng}&radius=25&limit=8`);
      if (response.ok) {
        const payload = await response.json();
        if (payload.success && Array.isArray(payload.manholes) && payload.manholes.length > 0) {
          setCandidateManholes(payload.manholes);
          setSelectedManholeId(payload.manholes[0].id);
          setState('ready');
          return;
        }
      }
      setCandidateManholes([]);
      setSelectedManholeId(null);
      setState('ready');
    } catch (nearbyError) {
      console.error('Failed to fetch nearby manholes:', nearbyError);
      setCandidateManholes([]);
      setSelectedManholeId(null);
      setState('ready');
    }
  }, []);

  const handlePhotoSelection = useCallback(
    async (file: File) => {
      setError(null);
      setState('analyzing');
      if (photo?.preview) {
        URL.revokeObjectURL(photo.preview);
      }

      const preview = URL.createObjectURL(file);
      try {
        const metadata = await exifr.parse(file);
        const shotAt = metadata?.DateTimeOriginal || metadata?.DateTime || new Date().toISOString();
        const pendingPhoto: PendingPhoto = {
          file,
          preview,
          metadata: {
            latitude: metadata?.latitude,
            longitude: metadata?.longitude,
            shotAt: new Date(shotAt).toISOString(),
            camera:
              metadata?.Make && metadata?.Model
                ? `${metadata.Make} ${metadata.Model}`
                : undefined,
          },
        };
        setPhoto(pendingPhoto);

        if (metadata?.latitude && metadata?.longitude) {
          await fetchNearbyManholes(metadata.latitude, metadata.longitude);
        } else {
          setCandidateManholes([]);
          setSelectedManholeId(null);
          setState('ready');
        }
      } catch (metadataError) {
        console.error('Failed to parse metadata:', metadataError);
        setPhoto({
          file,
          preview,
          metadata: {
            shotAt: new Date().toISOString(),
          },
        });
        setCandidateManholes([]);
        setSelectedManholeId(null);
        setState('ready');
      }
    },
    [fetchNearbyManholes, photo]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      await handlePhotoSelection(file);
    },
    [handlePhotoSelection]
  );

  const captureFromCamera = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        await handlePhotoSelection(target.files[0]);
      }
    };
    input.click();
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setError('端末の位置情報が利用できません');
      return;
    }
    setError(null);
    setState('analyzing');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchNearbyManholes(position.coords.latitude, position.coords.longitude);
      },
      (geoError) => {
        console.error('Geolocation error:', geoError);
        setError('位置情報の取得に失敗しました');
        setState('ready');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  const handleUpload = async () => {
    if (!photo || !selectedManholeId) {
      setError('写真とマンホールを選択してください');
      return;
    }

    try {
      setState('uploading');
      setError(null);

      const compressed = await imageCompression(photo.file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });

      const formData = new FormData();
      formData.append('file', compressed, photo.file.name);
      formData.append('manhole_id', selectedManholeId.toString());
      formData.append('shot_at', photo.metadata.shotAt || new Date().toISOString());
      if (photo.metadata.latitude && photo.metadata.longitude) {
        formData.append('latitude', photo.metadata.latitude.toString());
        formData.append('longitude', photo.metadata.longitude.toString());
      }
      formData.append(
        'metadata',
        JSON.stringify({
          onboarding: true,
          originalFilename: photo.file.name,
          camera: photo.metadata.camera,
        })
      );

      const response = await fetch('/api/image-upload', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'アップロードに失敗しました');
      }

      setState('success');
      setTimeout(() => {
        router.replace(returnTo || '/map');
        router.refresh();
      }, 2200);
    } catch (uploadError: any) {
      console.error('First upload failed:', uploadError);
      setError(uploadError?.message || 'アップロード中にエラーが発生しました');
      setState('ready');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.heic', '.heif'] },
    maxFiles: 1,
    multiple: false,
  });

  const isActionDisabled =
    !photo ||
    !selectedManholeId ||
    state === 'uploading' ||
    state === 'analyzing' ||
    state === 'success';

  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark flex flex-col">
      <header className="bg-gradient-to-r from-pokemon-red to-pokemon-yellow text-white px-6 py-5 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Sparkles className="w-6 h-6" />
          <div>
            <p className="font-pixel text-xs uppercase tracking-[0.3em]">Onboarding</p>
            <h1 className="font-pixelJp text-xl">まずは1枚、ポケふたの写真を登録してください</h1>
            <p className="font-pixelJp text-sm text-white/80 mt-1">この1枚で地図が完成します</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28">
        <section className="rpg-window">
          <div className="flex items-center justify-between border-b-2 border-rpg-border pb-3">
            <div>
              <p className="font-pixel text-xs text-rpg-textDark/70">STEP 1 / 1</p>
              <h2 className="font-pixelJp text-lg text-rpg-textDark">写真を1枚アップロード</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-pixelJp text-rpg-textDark">
              <Camera className="w-4 h-4" /> スマホ推奨
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div
              {...getRootProps()}
              className={`rpg-window border-dashed border-2 ${
                isDragActive ? 'border-rpg-yellow bg-rpg-yellow/10' : 'border-rpg-border'
              } cursor-pointer text-center py-10 px-4 transition-all`}
            >
              <input {...getInputProps()} />
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragActive ? 'text-rpg-yellow' : 'text-rpg-blue'}`} />
              <p className="font-pixelJp text-base text-rpg-textDark mb-2">写真を1枚選択またはドラッグ</p>
              <p className="font-pixelJp text-xs text-rpg-textDark/70 mb-4">JPEG / PNG / HEIC（最大2MB）</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="rpg-button text-xs">
                  <span className="font-pixelJp">ファイルを選ぶ</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    captureFromCamera();
                  }}
                  className="rpg-button rpg-button-success text-xs flex items-center gap-1"
                >
                  <Camera className="w-4 h-4" />
                  <span className="font-pixelJp">カメラで撮影</span>
                </button>
              </div>
            </div>

            {photo && (
              <div className="rpg-window">
                <div className="flex gap-3">
                  <img
                    src={photo.preview}
                    alt="preview"
                    className="w-24 h-24 object-cover border-2 border-rpg-border"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <div className="flex-1 space-y-1 text-sm font-pixelJp text-rpg-textDark">
                    <p className="font-bold">選択済み: {photo.file.name}</p>
                    {photo.metadata.camera && <p className="text-xs opacity-70">{photo.metadata.camera}</p>}
                    {photo.metadata.shotAt && (
                      <p className="text-xs opacity-70">
                        撮影日時: {new Date(photo.metadata.shotAt).toLocaleString('ja-JP')}
                      </p>
                    )}
                    {photo.metadata.latitude && photo.metadata.longitude ? (
                      <p className="text-xs flex items-center gap-1 opacity-70">
                        <MapPin className="w-3 h-3" />
                        {photo.metadata.latitude.toFixed(4)}, {photo.metadata.longitude.toFixed(4)}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={requestGeolocation}
                        className="text-xs text-rpg-blue underline"
                      >
                        位置情報を取得する
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rpg-window">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-rpg-textDark" />
            <h3 className="font-pixelJp text-sm text-rpg-textDark">近くのポケふた候補</h3>
          </div>

          {candidateManholes.length === 0 && (
            <div className="text-center py-6">
              <p className="font-pixelJp text-xs text-rpg-textDark/70 mb-3">
                位置情報から候補を取得できませんでした。
              </p>
              <button
                type="button"
                onClick={requestGeolocation}
                className="rpg-button rpg-button-primary text-xs flex items-center gap-1 mx-auto"
              >
                <Compass className="w-4 h-4" />
                <span className="font-pixelJp">現在地から探す</span>
              </button>
            </div>
          )}

          {candidateManholes.length > 0 && (
            <div className="space-y-2">
              {candidateManholes.map((manhole) => (
                <label
                  key={manhole.id}
                  className={`rpg-window cursor-pointer flex items-center gap-3 ${
                    selectedManholeId === manhole.id ? 'border-rpg-yellow bg-rpg-yellow/10' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="manhole"
                    className="sr-only"
                    checked={selectedManholeId === manhole.id}
                    onChange={() => setSelectedManholeId(manhole.id)}
                  />
                  <div className="flex-1">
                    <p className="font-pixelJp text-sm text-rpg-textDark">{formatManholeLabel(manhole)}</p>
                    {typeof (manhole as any).distance === 'number' && (
                      <p className="text-xs text-rpg-textDark/70">
                        およそ {((manhole as any).distance as number).toFixed(2)} km 以内
                      </p>
                    )}
                    {manhole.pokemons && manhole.pokemons.length > 0 && (
                      <p className="text-[10px] text-rpg-textDark/70 mt-1">
                        {manhole.pokemons.slice(0, 3).join(' / ')}
                      </p>
                    )}
                  </div>
                  <MapPin className="w-4 h-4 text-rpg-textDark" />
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="rpg-window">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-rpg-textDark" />
            <h3 className="font-pixelJp text-sm text-rpg-textDark">違う場所を検索する</h3>
          </div>
          <p className="font-pixelJp text-xs text-rpg-textDark/70 mb-3">
            市区町村名やポケモン名でも検索できます
          </p>
          <input
            type="text"
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            onFocus={loadManholeCatalog}
            className="w-full border-2 border-rpg-border bg-white/90 p-3 font-pixelJp text-sm"
            placeholder="例: 北海道, ピカチュウ"
          />
          {manualLoading && (
            <p className="mt-2 text-xs text-rpg-textDark/60 font-pixelJp">データを読み込み中...</p>
          )}
          {manualResults.length > 0 && (
            <div className="mt-3 max-h-60 overflow-y-auto space-y-2">
              {manualResults.map((manhole) => (
                <button
                  type="button"
                  key={`manual-${manhole.id}`}
                  onClick={() => setSelectedManholeId(manhole.id)}
                  className={`w-full text-left rpg-window ${
                    selectedManholeId === manhole.id ? 'border-rpg-yellow bg-rpg-yellow/10' : ''
                  }`}
                >
                  <p className="font-pixelJp text-sm text-rpg-textDark">{formatManholeLabel(manhole)}</p>
                  {manhole.pokemons && manhole.pokemons.length > 0 && (
                    <p className="text-[10px] text-rpg-textDark/70 mt-1">{manhole.pokemons.join(' / ')}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="rpg-window bg-rpg-red/10 border-rpg-red text-rpg-red flex items-center gap-2 text-sm font-pixelJp">
            <AlertCircle className="w-4 h-4" />
            <p>{error}</p>
          </div>
        )}

        <section className="rpg-window">
          <button
            type="button"
            onClick={handleUpload}
            disabled={isActionDisabled}
            className={`w-full rpg-button rpg-button-primary py-4 text-base flex items-center justify-center gap-2 ${
              isActionDisabled ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {state === 'uploading' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-pixelJp">登録中...</span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span className="font-pixelJp">この1枚を登録する</span>
              </>
            )}
          </button>

          {state === 'success' && (
            <div className="mt-4 p-4 bg-rpg-green/20 border-2 border-rpg-green text-rpg-green flex items-center gap-2 font-pixelJp">
              <CheckCircle className="w-5 h-5" />
              <div>
                <p className="text-sm">最初の1枚、ありがとうございます！</p>
                <p className="text-[11px] opacity-80">地図に反映中です...</p>
              </div>
            </div>
          )}
        </section>

        <p className="text-center text-[11px] text-rpg-textDark/60 font-pixelJp">
          ※初回アップロード完了後、自動的にホーム画面へ移動します
        </p>
      </main>
    </div>
  );
}
