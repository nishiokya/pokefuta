/**
 * 利用者が送ってきた画像を sharp に渡す前に、中身（先頭のバイト列）で形式を確かめる。
 *
 * sharp は Content-Type や拡張子ではなく中身を見て形式を判別し、AVIF/HEIF なら libheif、
 * SVG なら librsvg、GIF/TIFF なら libvips の各ローダでデコードする。これらのローダには
 * 細工した画像で RCE に至りうる穴が見つかっている（GHSA-rgj7-g3m4-5g8c / GHSA-wq5f-xc86-pv6w /
 * GHSA-f88m-g3jw-g9cj。sharp 0.35.5 で修正済みだが、同じローダで次の穴が出る前提で残す）。
 * アップロードの検査はブラウザ申告の file.type だけなので、`image/jpeg` と名乗った AVIF や SVG がそのまま届く。
 *
 * sharp.block() はプロセス全体に効き、OGP 画像の生成が SVG を sharp で描いているため使えない。
 * なので入口ごとに、投稿で実際に使う JPEG / PNG / WebP 以外を sharp に渡さない。
 * HEIC はクライアントが JPEG に変換して送る前提（そうでない古い投稿はサムネイルを作らない）。
 */
export type SniffedImageFormat = 'jpeg' | 'png' | 'webp';

export const SNIFFED_CONTENT_TYPE: Record<SniffedImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function sniffImageFormat(input: ArrayBuffer | Uint8Array): SniffedImageFormat | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'png';
  }
  // WebP: "RIFF" ???? "WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}
