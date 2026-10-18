import exifr from 'exifr';
import { calculateDistance, isValidCoordinates } from '@/lib/location';

// 投稿する写真の EXIF を読む。/upload と /upload/bulk で同じものを送るために共通化している。

export interface PhotoMetadata {
  latitude?: number;
  longitude?: number;
  datetime?: string;
  camera?: string;
  lens?: string;
  exifPayload?: Record<string, any>;
}

export async function extractPhotoMetadata(file: File): Promise<PhotoMetadata> {
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
}

/** 訪問の個人メモ（非公開）の既定値。撮影の情報と、蓋までの距離。 */
export function buildAutoVisitNote(
  metadata: PhotoMetadata,
  matchedManhole?: { latitude?: number | null; longitude?: number | null }
): string {
  const noteLines = [];
  if (metadata.camera) noteLines.push(`カメラ: ${metadata.camera}`);
  if (metadata.lens) noteLines.push(`レンズ: ${metadata.lens}`);
  if (metadata.datetime) {
    const date = new Date(metadata.datetime);
    noteLines.push(`撮影日時: ${date.toLocaleString('ja-JP')}`);
  }
  if (isValidCoordinates(metadata.latitude, metadata.longitude)) {
    noteLines.push(`位置: ${(metadata.latitude as number).toFixed(6)}, ${(metadata.longitude as number).toFixed(6)}`);
  }
  // マッチしたマンホールとの距離を追加
  if (matchedManhole && isValidCoordinates(metadata.latitude, metadata.longitude) &&
      matchedManhole.latitude != null && matchedManhole.longitude != null) {
    const distance = calculateDistance(
      metadata.latitude as number,
      metadata.longitude as number,
      matchedManhole.latitude,
      matchedManhole.longitude
    );
    const distanceM = Math.round(distance * 1000); // kmをmに変換
    noteLines.push(`マンホールまでの距離: 約${distanceM}m`);
  }
  return noteLines.join('\n');
}
