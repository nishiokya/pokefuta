export interface Prefecture {
  code: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
}

// 都道府県マスターデータ（都道府県コード、名称、中心座標）
export const PREFECTURES: readonly Prefecture[] = [
  { code: '01', name: '北海道', lat: 43.0642, lng: 141.3469, zoom: 7 },
  { code: '02', name: '青森県', lat: 40.8244, lng: 140.7400, zoom: 8 },
  { code: '03', name: '岩手県', lat: 39.7036, lng: 141.1527, zoom: 8 },
  { code: '04', name: '宮城県', lat: 38.2682, lng: 140.8719, zoom: 9 },
  { code: '05', name: '秋田県', lat: 39.7186, lng: 140.1024, zoom: 8 },
  { code: '06', name: '山形県', lat: 38.2404, lng: 140.3633, zoom: 9 },
  { code: '07', name: '福島県', lat: 37.7503, lng: 140.4676, zoom: 8 },
  { code: '08', name: '茨城県', lat: 36.3418, lng: 140.4468, zoom: 9 },
  { code: '09', name: '栃木県', lat: 36.5658, lng: 139.8836, zoom: 9 },
  { code: '10', name: '群馬県', lat: 36.3910, lng: 139.0605, zoom: 9 },
  { code: '11', name: '埼玉県', lat: 35.8569, lng: 139.6489, zoom: 10 },
  { code: '12', name: '千葉県', lat: 35.6051, lng: 140.1233, zoom: 9 },
  { code: '13', name: '東京都', lat: 35.6895, lng: 139.6917, zoom: 10 },
  { code: '14', name: '神奈川県', lat: 35.4478, lng: 139.6425, zoom: 10 },
  { code: '15', name: '新潟県', lat: 37.9022, lng: 139.0232, zoom: 8 },
  { code: '16', name: '富山県', lat: 36.6953, lng: 137.2113, zoom: 9 },
  { code: '17', name: '石川県', lat: 36.5946, lng: 136.6256, zoom: 9 },
  { code: '18', name: '福井県', lat: 36.0652, lng: 136.2216, zoom: 9 },
  { code: '19', name: '山梨県', lat: 35.6642, lng: 138.5684, zoom: 9 },
  { code: '20', name: '長野県', lat: 36.6513, lng: 138.1810, zoom: 8 },
  { code: '21', name: '岐阜県', lat: 35.3912, lng: 136.7223, zoom: 9 },
  { code: '22', name: '静岡県', lat: 34.9769, lng: 138.3831, zoom: 9 },
  { code: '23', name: '愛知県', lat: 35.1802, lng: 136.9066, zoom: 9 },
  { code: '24', name: '三重県', lat: 34.7303, lng: 136.5086, zoom: 9 },
  { code: '25', name: '滋賀県', lat: 35.0045, lng: 135.8686, zoom: 9 },
  { code: '26', name: '京都府', lat: 35.0211, lng: 135.7556, zoom: 9 },
  { code: '27', name: '大阪府', lat: 34.6863, lng: 135.5200, zoom: 10 },
  { code: '28', name: '兵庫県', lat: 34.6913, lng: 135.1830, zoom: 9 },
  { code: '29', name: '奈良県', lat: 34.6851, lng: 135.8050, zoom: 9 },
  { code: '30', name: '和歌山県', lat: 34.2261, lng: 135.1675, zoom: 9 },
  { code: '31', name: '鳥取県', lat: 35.5036, lng: 134.2383, zoom: 9 },
  { code: '32', name: '島根県', lat: 35.4723, lng: 133.0505, zoom: 9 },
  { code: '33', name: '岡山県', lat: 34.6617, lng: 133.9350, zoom: 9 },
  { code: '34', name: '広島県', lat: 34.3965, lng: 132.4596, zoom: 9 },
  { code: '35', name: '山口県', lat: 34.1861, lng: 131.4714, zoom: 9 },
  { code: '36', name: '徳島県', lat: 34.0658, lng: 134.5595, zoom: 9 },
  { code: '37', name: '香川県', lat: 34.3401, lng: 134.0434, zoom: 10 },
  { code: '38', name: '愛媛県', lat: 33.8416, lng: 132.7657, zoom: 9 },
  { code: '39', name: '高知県', lat: 33.5597, lng: 133.5311, zoom: 9 },
  { code: '40', name: '福岡県', lat: 33.6064, lng: 130.4181, zoom: 9 },
  { code: '41', name: '佐賀県', lat: 33.2494, lng: 130.2988, zoom: 9 },
  { code: '42', name: '長崎県', lat: 32.7503, lng: 129.8777, zoom: 9 },
  { code: '43', name: '熊本県', lat: 32.7898, lng: 130.7417, zoom: 9 },
  { code: '44', name: '大分県', lat: 33.2382, lng: 131.6126, zoom: 9 },
  { code: '45', name: '宮崎県', lat: 31.9111, lng: 131.4239, zoom: 9 },
  { code: '46', name: '鹿児島県', lat: 31.5602, lng: 130.5581, zoom: 8 },
  { code: '47', name: '沖縄県', lat: 26.2124, lng: 127.6809, zoom: 9 },
];

export const PREFECTURE_BY_CODE: ReadonlyMap<string, Prefecture> = new Map(
  PREFECTURES.map((pref) => [pref.code, pref])
);

/** 県庁所在地にいちばん近い県。県境・離島では外れるので、住所判定が使えないときの予備 */
export function nearestPrefecture(lat: number, lng: number): Prefecture {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best = PREFECTURES[0];
  let bestDist = Infinity;
  for (const pref of PREFECTURES) {
    const dLat = pref.lat - lat;
    const dLng = (pref.lng - lng) * cosLat;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = pref;
    }
  }
  return best;
}
