#!/usr/bin/env node
/**
 * Backfill small thumbnail variants for existing photos.
 *
 * photo テーブルの storage_key (photos/original/YYYY/MM/{uuid}.jpg) から
 * photos/small/YYYY/MM/{uuid}.webp を生成して R2 に保存する。
 * /api/photo/[id]?size=small が読む派生キーと同じ規則
 * (src/lib/storage/index.ts の deriveSmallKey と一致させること)。
 *
 * 既に小変種が存在する写真はスキップするので再実行安全。
 *
 * Usage:
 *   node tools/backfill-thumbnails.js --dry-run
 *   node tools/backfill-thumbnails.js --limit 10
 *   node tools/backfill-thumbnails.js
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

// --- env ---------------------------------------------------------------

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'image';

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT: process.env.R2_ENDPOINT,
})) {
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// --- args --------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
let LIMIT = 0;
if (limitIdx !== -1) {
  LIMIT = parseInt(args[limitIdx + 1], 10);
  if (!Number.isInteger(LIMIT) || LIMIT <= 0) {
    console.error('--limit requires a positive integer (e.g. --limit 10)');
    process.exit(1);
  }
}
const CONCURRENCY = 5;

// Must match deriveSmallKey in src/lib/storage/index.ts
function deriveSmallKey(storageKey) {
  if (!storageKey.startsWith('photos/original/')) return null;
  return storageKey.replace('photos/original/', 'photos/small/').replace(/\.[^./]+$/, '.webp');
}

// --- supabase REST (avoid extra deps) -----------------------------------

async function fetchPhotoPage(offset, pageSize) {
  const url = `${SUPABASE_URL}/rest/v1/photo?select=id,storage_key&order=created_at.asc&offset=${offset}&limit=${pageSize}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST error ${res.status}: ${await res.text()}`);
  }
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1] || '0', 10);
  return { rows: await res.json(), total };
}

// --- R2 helpers ----------------------------------------------------------

async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
    throw err;
  }
}

async function getObjectBuffer(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// --- main ----------------------------------------------------------------

async function processPhoto(photo, counters, failures) {
  const smallKey = deriveSmallKey(photo.storage_key);
  if (!smallKey) {
    counters.skippedKey++;
    return;
  }
  try {
    if (await objectExists(smallKey)) {
      counters.alreadyExists++;
      return;
    }
    if (DRY_RUN) {
      counters.wouldGenerate++;
      console.log(`[dry-run] would generate ${smallKey}`);
      return;
    }
    const original = await getObjectBuffer(photo.storage_key);
    const small = await sharp(original)
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: smallKey,
      Body: small,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    counters.generated++;
  } catch (err) {
    counters.failed++;
    failures.push({ id: photo.id, storage_key: photo.storage_key, error: err.message });
  }
}

async function main() {
  const pageSize = 500;
  const counters = { generated: 0, alreadyExists: 0, wouldGenerate: 0, skippedKey: 0, failed: 0 };
  const failures = [];
  let offset = 0;
  let processed = 0;
  let total = null;

  while (true) {
    const { rows, total: totalCount } = await fetchPhotoPage(offset, pageSize);
    if (total === null) {
      total = totalCount;
      console.log(`photo total: ${total}${DRY_RUN ? ' (dry-run)' : ''}${LIMIT ? ` limit=${LIMIT}` : ''}`);
    }
    if (rows.length === 0) break;

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const remaining = LIMIT ? LIMIT - processed : Infinity;
      if (remaining <= 0) break;
      const batch = rows.slice(i, i + Math.min(CONCURRENCY, remaining))
        .map((photo) => {
          processed++;
          return processPhoto(photo, counters, failures);
        });
      if (batch.length === 0) break;
      await Promise.all(batch);
      if (processed % 50 === 0) {
        console.log(`progress: ${processed}/${LIMIT || total} generated=${counters.generated} exists=${counters.alreadyExists} failed=${counters.failed}`);
      }
    }

    if (LIMIT && processed >= LIMIT) break;
    // 最終ページ(満杯未満)で終了。ちょうど総数で割り切れる場合に
    // 次ページを要求すると Supabase REST が 416 を返すため。
    if (rows.length < pageSize || offset + rows.length >= total) break;
    offset += pageSize;
  }

  console.log('\nsummary:', counters);
  if (failures.length > 0) {
    console.log('\nfailures:');
    for (const f of failures) console.log(`  ${f.id} ${f.storage_key}: ${f.error}`);
  }
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
