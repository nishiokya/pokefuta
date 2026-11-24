import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageAdapter, PutOptions, SignedUrl } from './types';

export class R2StorageAdapter implements StorageAdapter {
  private s3Client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(bucket?: string) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const endpoint = process.env.R2_ENDPOINT;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!accessKeyId || !secretAccessKey || !endpoint) {
      throw new Error('R2 credentials not configured. Please set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT');
    }

    this.bucket = bucket ?? process.env.R2_BUCKET ?? 'image';
    this.publicUrl = publicUrl ?? endpoint;

    console.log('[R2StorageAdapter] Initialized with:', {
      bucket: this.bucket,
      endpoint,
      publicUrl: this.publicUrl,
    });

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async put(key: string, data: ArrayBuffer | Buffer | Blob, options?: PutOptions): Promise<void> {
    try {
      let bodyData: Buffer;

      if (data instanceof ArrayBuffer) {
        bodyData = Buffer.from(data);
      } else if (data instanceof Blob) {
        const arrayBuffer = await data.arrayBuffer();
        bodyData = Buffer.from(arrayBuffer);
      } else {
        bodyData = data;
      }

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bodyData,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl ?? 'public, max-age=31536000, immutable',
        Metadata: options?.metadata,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('R2 storage upload error:', error);
      throw new Error(`Failed to upload to R2: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
    }
  }

  async getSignedUrl(key: string, ttlSec: number): Promise<SignedUrl> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: ttlSec,
      });

      return {
        url,
        expiresAt: Math.floor(Date.now() / 1000) + ttlSec,
      };
    } catch (error) {
      console.error('R2 storage signed URL error:', error);
      throw new Error(`Failed to create signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      console.error('R2 storage exists check error:', error);
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('R2 storage delete error:', error);
      throw new Error(`Failed to delete from R2: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
    }
  }

  /**
   * 小さなテキストのオブジェクトを ETag つきで読む。無ければ null。
   * 公開ページ用のスナップショット（src/lib/user-snapshot.ts）が、書き戻すときの条件に ETag を使う。
   */
  async getText(key: string, timeoutMs: number): Promise<{ body: string; etag: string | null } | null> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(timeoutMs) },
      );
      const body = await response.Body?.transformToString();
      if (body === undefined) return null;
      return { body, etag: response.ETag ?? null };
    } catch (error: any) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  /**
   * 条件つきの書き込み。ifMatch はその ETag のときだけ、ifNoneMatch: '*' は無いときだけ書く。
   * 条件が合わなかったら false（ほかの書き込みが先に入った）。それ以外の失敗は例外。
   */
  async putTextIf(
    key: string,
    body: string,
    options: { contentType: string; ifMatch?: string; ifNoneMatch?: '*' },
  ): Promise<boolean> {
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: 'private, no-store',
        IfMatch: options.ifMatch,
        IfNoneMatch: options.ifNoneMatch,
      }));
      return true;
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 412 || error?.name === 'PreconditionFailed') return false;
      throw error;
    }
  }

  /**
   * Get the public URL for a key (if bucket is configured for public access)
   */
  getPublicUrl(key: string): string {
    // R2 public URL format: https://<account_id>.r2.cloudflarestorage.com/<bucket>/<key>
    // Or custom domain: https://<custom-domain>/<key>
    if (this.publicUrl.includes('r2.cloudflarestorage.com')) {
      return `${this.publicUrl}/${this.bucket}/${key}`;
    }
    // Custom domain - key only
    return `${this.publicUrl}/${key}`;
  }
}
