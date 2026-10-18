// まとめて投稿で使う、ブラウザ側のファイル操作（フォルダのドロップとサムネイル）。

const IMAGE_EXTENSIONS = /\.(jpe?g|png|heic|heif)$/i;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);
}

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (file: File) => void, ng: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: FsEntry[]) => void, ng: (error: unknown) => void) => void };
};

async function filesFromEntry(entry: FsEntry): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    return [file];
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const files: File[] = [];
    // readEntries は1回で全件を返さないので、空になるまで読む
    for (;;) {
      const batch = await new Promise<FsEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      for (const child of batch) files.push(...(await filesFromEntry(child)));
    }
    return files;
  }
  return [];
}

/**
 * ドロップされたものからファイルを取り出す。フォルダは中を再帰的に読む。
 * webkitGetAsEntry が無いブラウザでは、ファイルだけを取る（フォルダは無視される）。
 */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => (item.kind === 'file' && 'webkitGetAsEntry' in item ? (item.webkitGetAsEntry() as FsEntry | null) : null))
    .filter((entry): entry is FsEntry => entry !== null);
  if (entries.length === 0) return Array.from(dataTransfer.files ?? []);
  const files: File[] = [];
  for (const entry of entries) {
    try {
      files.push(...(await filesFromEntry(entry)));
    } catch {
      // 読めないフォルダは飛ばす
    }
  }
  return files;
}

/**
 * 小さなサムネイル（JPEG の data URL）。元画像は持ち続けない。
 * iPhone で100枚の元画像を並べるとメモリで落ちるため、1枚ずつ縮めて捨てる。
 * ブラウザが開けない形式（Windows の Chrome の HEIC など）は null。
 */
export async function makeThumbnail(file: File, size = 240): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}
