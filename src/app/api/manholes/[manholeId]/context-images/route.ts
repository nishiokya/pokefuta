import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import {
  Database,
  ManholeClassifierLabel,
  OverlayQualityGrade,
  ShotContextLabel,
} from '@/types/database';
import { generateContextImageStorageKey, storage } from '@/lib/storage';
import { SHOT_CONTEXT_LABELS } from '@/lib/shot-context-labels';

const MAX_CONTEXT_IMAGES_PER_USER_MANHOLE = 5;
const MAX_CONTEXT_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const IOS_PLATFORM_HEADER = 'x-pokefuta-client-platform';
const IOS_TOKEN_HEADER = 'x-pokefuta-ios-api-key';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);
const MANHOLE_LABELS = new Set<ManholeClassifierLabel>(['manhole', 'not_manhole']);
const OVERLAY_QUALITY_GRADES = new Set<OverlayQualityGrade>(['p', 'e', 'g', 'f', 'b']);

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isIosContextRequest(request: NextRequest) {
  const platform = request.headers.get(IOS_PLATFORM_HEADER)?.toLowerCase();
  if (platform !== 'ios') return false;

  const configuredToken = process.env.IOS_CONTEXT_UPLOAD_TOKEN;
  if (!configuredToken) return true;

  const tokenHeader = request.headers.get(IOS_TOKEN_HEADER);
  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  return tokenHeader === configuredToken || bearerToken === configuredToken;
}

function parseJsonField(value: FormDataEntryValue | null, fieldName: string) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a JSON string`);
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationError(`${fieldName} must be valid JSON`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseShotContextLabel(value: FormDataEntryValue | null): ShotContextLabel | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!SHOT_CONTEXT_LABELS.has(value as ShotContextLabel)) {
    throw new ValidationError('Invalid shot_context_label');
  }
  return value as ShotContextLabel;
}

function parseAnnotationShotContextLabel(value: FormDataEntryValue | null): ShotContextLabel | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!SHOT_CONTEXT_LABELS.has(value as ShotContextLabel)) {
    throw new ValidationError('Invalid annotation_shot_context_label');
  }
  return value as ShotContextLabel;
}

function parseConfidence(value: FormDataEntryValue | null, fieldName: string) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new ValidationError(`${fieldName} must be between 0 and 1`);
  }
  return confidence;
}

function parseOptionalManholeLabel(
  value: FormDataEntryValue | null,
  fieldName: string
): ManholeClassifierLabel | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!MANHOLE_LABELS.has(value as ManholeClassifierLabel)) {
    throw new ValidationError(`${fieldName} must be one of: manhole, not_manhole`);
  }
  return value as ManholeClassifierLabel;
}

function parseOptionalOverlayQualityGrade(value: FormDataEntryValue | null): OverlayQualityGrade | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!OVERLAY_QUALITY_GRADES.has(value as OverlayQualityGrade)) {
    throw new ValidationError('overlay_quality_grade must be one of: p, e, g, f, b');
  }
  return value as OverlayQualityGrade;
}

function metadataString(metadata: unknown, key: string) {
  if (!isPlainObject(metadata)) return null;
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function metadataConfidence(metadata: unknown, key: string, fieldName: string) {
  if (!isPlainObject(metadata)) return null;
  const value = metadata[key];
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new ValidationError(`${fieldName} must be between 0 and 1`);
    }
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    return parseConfidence(value, fieldName);
  }
  return null;
}

async function getImageDimensions(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    };
  } catch {
    return {
      width: null,
      height: null,
    };
  }
}

/**
 * @swagger
 * /api/manholes/{manholeId}/context-images:
 *   post:
 *     summary: iOSアプリからマンホール周辺画像をアップロード
 *     tags: [photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: manholeId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: x-pokefuta-client-platform
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ios]
 *         description: Must be "ios". Required for all requests to this endpoint.
 *       - in: header
 *         name: x-pokefuta-ios-api-key
 *         required: false
 *         schema:
 *           type: string
 *         description: iOS API key. Required when IOS_CONTEXT_UPLOAD_TOKEN is configured (alternative to Bearer token).
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               shot_context_label:
 *                 type: string
 *                 enum: [centered_clean, selfie_with_manhole, wide_context, signage_info, partial_occluded, not_relevant, low_quality]
 *               shot_context_confidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               shot_context_confidences:
 *                 type: string
 *                 description: JSON string containing all shot context label confidences.
 *               manhole_classifier_label:
 *                 type: string
 *                 enum: [manhole, not_manhole]
 *               manhole_classifier_confidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               manhole_detection_result:
 *                 type: string
 *                 description: JSON string containing detector status, confidence, bbox, raw_bbox, and model_name.
 *               overlay_quality_grade:
 *                 type: string
 *                 enum: [p, e, g, f, b]
 *               annotation_manhole_label:
 *                 type: string
 *                 enum: [manhole, not_manhole]
 *               annotation_shot_context_label:
 *                 type: string
 *                 enum: [centered_clean, selfie_with_manhole, wide_context, signage_info, partial_occluded, not_relevant, low_quality]
 *               metadata:
 *                 type: string
 *                 description: JSON string. Legacy metadata.manhole_classifier_* values are used as fallback when top-level classifier fields are absent.
 *               exif:
 *                 type: string
 *                 description: JSON string.
 *               app_version:
 *                 type: string
 *               device_model:
 *                 type: string
 *               sort_order:
 *                 type: integer
 *                 minimum: 0
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { manholeId: string } }
) {
  let uploadedStorageKey: string | null = null;

  try {
    if (!isIosContextRequest(request)) {
      return NextResponse.json({
        success: false,
        error: 'iOS app authorization required',
      }, { status: 403 });
    }

    const manholeId = Number(params.manholeId);
    if (!Number.isInteger(manholeId) || manholeId <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid manhole_id',
      }, { status: 400 });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { data: manhole, error: manholeError } = await supabase
      .from('manhole')
      .select('id')
      .eq('id', manholeId)
      .single();

    if (manholeError || !manhole) {
      return NextResponse.json({
        success: false,
        error: 'Manhole not found',
      }, { status: 404 });
    }

    const { count, error: countError } = await supabase
      .from('photo_context_image')
      .select('id', { count: 'exact', head: true })
      .eq('manhole_id', manholeId)
      .eq('created_by', user.id);

    if (countError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to count context images',
        details: countError.message,
      }, { status: 500 });
    }

    if ((count ?? 0) >= MAX_CONTEXT_IMAGES_PER_USER_MANHOLE) {
      return NextResponse.json({
        success: false,
        error: `Context image limit reached (max ${MAX_CONTEXT_IMAGES_PER_USER_MANHOLE})`,
      }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided',
      }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({
        success: false,
        error: 'Unsupported image content type',
      }, { status: 400 });
    }

    if (file.size > MAX_CONTEXT_IMAGE_SIZE_BYTES) {
      return NextResponse.json({
        success: false,
        error: `Context image is too large (max ${MAX_CONTEXT_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`,
      }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    const shotContextLabel = parseShotContextLabel(formData.get('shot_context_label'));
    const shotContextConfidence = parseConfidence(
      formData.get('shot_context_confidence'),
      'shot_context_confidence'
    );
    const shotContextConfidences = parseJsonField(
      formData.get('shot_context_confidences'),
      'shot_context_confidences'
    );
    const metadata = parseJsonField(formData.get('metadata'), 'metadata') ?? {};
    const topLevelManholeClassifierLabel = parseOptionalManholeLabel(
      formData.get('manhole_classifier_label'),
      'manhole_classifier_label'
    );
    const metadataManholeClassifierLabel = metadataString(metadata, 'manhole_classifier_label');
    const manholeClassifierLabel = topLevelManholeClassifierLabel ?? parseOptionalManholeLabel(
      metadataManholeClassifierLabel,
      'metadata.manhole_classifier_label'
    );
    const manholeClassifierConfidence = parseConfidence(
      formData.get('manhole_classifier_confidence'),
      'manhole_classifier_confidence'
    ) ?? metadataConfidence(
      metadata,
      'manhole_classifier_confidence',
      'metadata.manhole_classifier_confidence'
    );
    const manholeDetectionResultRaw = parseJsonField(
      formData.get('manhole_detection_result'),
      'manhole_detection_result'
    );
    if (manholeDetectionResultRaw !== null && !isPlainObject(manholeDetectionResultRaw)) {
      return NextResponse.json({
        success: false,
        error: 'manhole_detection_result must be a JSON object',
      }, { status: 400 });
    }
    const manholeDetectionResult = manholeDetectionResultRaw;
    const overlayQualityGrade = parseOptionalOverlayQualityGrade(formData.get('overlay_quality_grade'));
    const annotationManholeLabel = parseOptionalManholeLabel(
      formData.get('annotation_manhole_label'),
      'annotation_manhole_label'
    );
    const annotationShotContextLabel = parseAnnotationShotContextLabel(
      formData.get('annotation_shot_context_label')
    );
    const exif = parseJsonField(formData.get('exif'), 'exif');
    const appVersion = formData.get('app_version');
    const deviceModel = formData.get('device_model');
    const sortOrder = formData.get('sort_order');
    const parsedSortOrder = typeof sortOrder === 'string' && sortOrder.length > 0
      ? Number(sortOrder)
      : count ?? 0;

    if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
      return NextResponse.json({
        success: false,
        error: 'sort_order must be a non-negative integer',
      }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const dimensions = await getImageDimensions(buffer);
    const storageKey = generateContextImageStorageKey(manholeId, file.type);
    uploadedStorageKey = storageKey;

    await storage.put(storageKey, buffer, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        'manhole-id': String(manholeId),
        'created-by': user.id,
        'source-platform': 'ios',
        ...(shotContextLabel ? { 'shot-context-label': shotContextLabel } : {}),
      },
    });

    const { data: inserted, error: insertError } = await supabase
      .from('photo_context_image')
      .insert({
        manhole_id: manholeId,
        storage_provider: process.env.STORAGE_PROVIDER || 'r2',
        storage_key: storageKey,
        original_name: file.name || null,
        content_type: file.type,
        file_size: fileSize,
        width: dimensions.width,
        height: dimensions.height,
        sha256,
        exif,
        metadata,
        shot_context_label: shotContextLabel,
        shot_context_confidence: shotContextConfidence,
        shot_context_confidences: shotContextConfidences,
        manhole_classifier_label: manholeClassifierLabel,
        manhole_classifier_confidence: manholeClassifierConfidence,
        manhole_detection_result: manholeDetectionResult,
        overlay_quality_grade: overlayQualityGrade,
        annotation_manhole_label: annotationManholeLabel,
        annotation_shot_context_label: annotationShotContextLabel,
        source_platform: 'ios',
        app_version: typeof appVersion === 'string' && appVersion.length > 0 ? appVersion : null,
        device_model: typeof deviceModel === 'string' && deviceModel.length > 0 ? deviceModel : null,
        sort_order: parsedSortOrder,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message || 'Failed to create context image record');
    }

    const signedUrl = await storage.getSignedUrl(storageKey, 3600);

    return NextResponse.json({
      success: true,
      message: 'Context image uploaded successfully',
      context_image: {
        ...inserted,
        url: signedUrl.url,
        expires_at: signedUrl.expiresAt,
      },
    });
  } catch (error: any) {
    if (uploadedStorageKey && storage.delete) {
      try {
        await storage.delete(uploadedStorageKey);
      } catch (storageError) {
        console.error('Failed to cleanup context image after error:', storageError);
      }
    }

    const isValidation = error instanceof ValidationError;
    console.error('Context image upload error:', error);
    return NextResponse.json({
      success: false,
      error: isValidation ? error.message : 'Failed to upload context image',
      details: isValidation ? undefined : error?.message,
    }, { status: isValidation ? 400 : 500 });
  }
}
