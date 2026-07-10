import { SupabaseStorageAdapter } from './supabase';
import { R2StorageAdapter } from './r2';
import type { StorageAdapter, StorageConfig } from './types';

export function createStorageAdapter(config?: StorageConfig): StorageAdapter {
  const provider = config?.provider ?? (process.env.STORAGE_PROVIDER as any) ?? 'r2';
  const bucket = config?.bucket ?? process.env.R2_BUCKET ?? process.env.SUPABASE_BUCKET ?? 'image';

  switch (provider) {
    case 'supabase':
      return new SupabaseStorageAdapter(bucket);
    case 's3':
      // TODO: Implement S3StorageAdapter
      throw new Error('S3 storage adapter not implemented yet');
    case 'r2':
      return new R2StorageAdapter(bucket);
    default:
      throw new Error(`Unknown storage provider: ${provider}`);
  }
}

// Default storage adapter
export const storage = createStorageAdapter();

// Storage key utilities
export function generateStorageKey(type: 'original' | 'thumb', size?: number): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();

  if (type === 'thumb' && size) {
    return `photos/thumb/${size}/${year}/${month}/${uuid}.jpg`;
  }

  return `photos/original/${year}/${month}/${uuid}.jpg`;
}

// Derive the small-variant key from an original storage key.
// photos/original/YYYY/MM/{uuid}.jpg -> photos/small/YYYY/MM/{uuid}.webp
// Deterministic so the read path can re-derive it without a DB column.
// Returns null for keys that don't follow the original-photo layout.
export function deriveSmallKey(storageKey: string): string | null {
  if (!storageKey.startsWith('photos/original/')) {
    return null;
  }
  return storageKey
    .replace('photos/original/', 'photos/small/')
    .replace(/\.[^./]+$/, '.webp');
}

export function generateContextImageStorageKey(manholeId: number, contentType?: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const extension = contentTypeToExtension(contentType);

  return `photos/context/original/${year}/${month}/manholes/${manholeId}/${uuid}.${extension}`;
}

// デザインマンホール投稿写真用キー。visit 写真の photos/original/ とは
// プレフィックスを分け、モデレーション・一括削除をしやすくする。
export function generateDesignManholeStorageKey(contentType?: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const extension = contentTypeToExtension(contentType);

  return `photos/design/original/${year}/${month}/${uuid}.${extension}`;
}

// photos/design/original/YYYY/MM/{uuid}.{ext} -> photos/design/small/YYYY/MM/{uuid}.webp
// deriveSmallKey と同じ規約（決定的・DBカラム不要）。対象外のキーは null。
export function deriveDesignSmallKey(storageKey: string): string | null {
  if (!storageKey.startsWith('photos/design/original/')) {
    return null;
  }
  return storageKey
    .replace('photos/design/original/', 'photos/design/small/')
    .replace(/\.[^./]+$/, '.webp');
}

function contentTypeToExtension(contentType?: string): string {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
}

export function parseStorageKey(key: string) {
  const parts = key.split('/');
  if (parts.length < 4) {
    throw new Error('Invalid storage key format');
  }

  const [, type, sizeOrYear, year, month, filename] = parts;

  if (type === 'thumb') {
    return {
      type: 'thumb' as const,
      size: parseInt(sizeOrYear),
      year: parseInt(year),
      month: parseInt(month),
      filename,
    };
  }

  return {
    type: 'original' as const,
    size: null,
    year: parseInt(sizeOrYear),
    month: parseInt(year), // Note: month is in the year position for original
    filename: month, // Note: filename includes month/filename for original
  };
}

export * from './types';
export { SupabaseStorageAdapter };
export { R2StorageAdapter };
