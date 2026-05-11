/**
 * 位置情報ユーティリティ関数
 * Haversine距離計算などを提供
 */

/**
 * PostGIS WKB（Well-Known Binary）フォーマットから座標を抽出
 * エンディアン、SRID、標準WKBフォーマットに対応
 * 
 * WKBフォーマット:
 * - バイト0: エンディアンフラグ（01=LE, 00=BE）
 * - バイト1-4: ジオメトリ型（1=POINT）
 * - オプション: SRID(4バイト)
 * - 以降: 座標(X=lng, Y=lat各8バイト)
 * 
 * @param wkbHex HEX文字列（PostGIS location列の値）
 * @returns { lat, lng } オブジェクト、または null
 */
export function extractCoordinatesFromWKB(wkbHex: string): { lat: number; lng: number } | null {
  if (!wkbHex || typeof wkbHex !== 'string') return null;

  try {
    const cleanHex = wkbHex.startsWith('0x') ? wkbHex.slice(2) : wkbHex;
    
    // 最小長: 01 + 01000000 + 0000000000000000 + 0000000000000000 = 42文字
    if (cleanHex.length < 42) return null;

    // バイト0: エンディアンフラグ読み込み
    const endianByte = cleanHex.substring(0, 2);
    const isLittleEndian = endianByte === '01';
    const readDouble = (hex: string, offset: number): number => {
      if (hex.length < offset + 16) return NaN;
      const buffer = Buffer.from(hex.substring(offset, offset + 16), 'hex');
      return isLittleEndian ? buffer.readDoubleLE(0) : buffer.readDoubleBE(0);
    };

    // バイト1-4: ジオメトリ型を読み込み
    const typeHex = cleanHex.substring(2, 10);
    const typeBuffer = Buffer.from(typeHex, 'hex');
    const geomType = isLittleEndian ? typeBuffer.readUInt32LE(0) : typeBuffer.readUInt32BE(0);

    // ジオメトリ型の下位2バイトから実際の型を取得（1=POINT）
    const baseType = geomType & 0xFFFF;
    if (baseType !== 1) return null;

    // SRID有無を判定（0x20000000フラグ）
    const hasSrid = (geomType & 0x20000000) !== 0;
    let coordOffset = 10; // バイト5から座標開始（10文字目）

    if (hasSrid) {
      // SRID付きの場合、4バイト（8文字）スキップ
      coordOffset = 18;
    }

    // 座標を読み込み
    const lng = readDouble(cleanHex, coordOffset);
    const lat = readDouble(cleanHex, coordOffset + 16);

    // 座標の妥当性チェック
    if (!isNaN(lng) && !isNaN(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
      return { lat, lng };
    }

    return null;
  } catch (error) {
    console.error('Error parsing WKB:', error);
    return null;
  }
}

/**
 * Haversine公式を使用して2つの地点間の距離を計算
 * @param lat1 地点1の緯度
 * @param lng1 地点1の経度
 * @param lat2 地点2の緯度
 * @param lng2 地点2の経度
 * @returns 距離（キロメートル）
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // 地球の半径（km）
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 距離をメートル単位の文字列に変換
 * @param distanceKm 距離（キロメートル）
 * @returns メートル単位の文字列
 */
export function formatDistanceAsMeters(distanceKm: number): string {
  const meters = Math.round(distanceKm * 1000);
  return `約${meters}m`;
}

/**
 * GPS座標がマンホール位置から50m以内か判定
 * @param userLat ユーザーのGPS緯度
 * @param userLng ユーザーのGPS経度
 * @param manholeLat マンホールの緯度
 * @param manholeLng マンホールの経度
 * @param thresholdKm 判定距離（デフォルト0.05km=50m）
 * @returns true: 50m以内, false: 50m以上
 */
// マンホール距離判定の最大値（50m）
export const MAX_DISTANCE_KM = 0.05;

export function isWithinThreshold(
  userLat: number,
  userLng: number,
  manholeLat: number,
  manholeLng: number,
  thresholdKm: number = MAX_DISTANCE_KM
): boolean {
  const distance = calculateDistance(userLat, userLng, manholeLat, manholeLng);
  return distance <= thresholdKm;
}

/**
 * GPS座標が有効な緯度経度か判定
 * @param latitude 緯度
 * @param longitude 経度
 * @returns true: 有効, false: 無効
 */
export function isValidCoordinates(
  latitude: number | undefined,
  longitude: number | undefined
): boolean {
  return (
      latitude != null &&
      longitude != null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
  );
}
