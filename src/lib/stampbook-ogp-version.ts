// 公開スタンプ帳の OGP 画像のバージョン。
// og:image の URL（?v=）と、R2 に保存した生成済み PNG のキーの両方に使う。
// テンプレートを変えたら TEMPLATE_VERSION を上げる。
// 画像の生成は CDN が冷えていると 9〜12 秒かかり、X のクローラーが待ちきれずカードが出ない。
// そこで URL に「公開内容の印」を載せ、内容が変わらない間は同じ URL を長く CDN に載せる。
// 内容が変われば URL が変わり、古い画像は自然に使われなくなる。
// 20261028: 称号・3つの輪・バッジのメダル・ステッカーをページと同じ見た目で載せた
// 20261123: URL を /users/<id> に移し、印つきの長期キャッシュにした
export const STAMPBOOK_OGP_TEMPLATE_VERSION = '20261123-userurl';

export type StampbookOgpVersionInput = {
  totalVisits: number;
  prefectureCount: number;
  displayName: string;
  visits: { createdAt: string | null; shotAt: string | null; photoIds: string[] }[];
};

// 画像に効く公開内容（件数・最新の公開訪問・表示名・代表写真）から短い印を作る。
// すでに generateMetadata が取っているデータだけで作るので、追加のクエリは打たない。
function stampbookOgpStamp(data: StampbookOgpVersionInput): string {
  let latest = 0;
  for (const visit of data.visits) {
    for (const value of [visit.createdAt, visit.shotAt]) {
      const t = value ? Date.parse(value) : NaN;
      if (Number.isFinite(t) && t > latest) latest = t;
    }
  }
  // 表示名と各訪問の代表写真も印に反映する（djb2）。
  // 既存の訪問に写真を足すと代表写真だけが変わり、日時・件数は変わらないため（PR #490 Codex 指摘）
  const source = [data.displayName, ...data.visits.map((visit) => visit.photoIds.join(','))].join('\n');
  let hash = 5381;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
  }
  return [
    Math.floor(latest / 1000).toString(36),
    data.totalVisits.toString(36),
    data.prefectureCount.toString(36),
    hash.toString(36),
  ].join('');
}

export function stampbookOgpVersion(data: StampbookOgpVersionInput): string {
  return `${STAMPBOOK_OGP_TEMPLATE_VERSION}-${stampbookOgpStamp(data)}`;
}
