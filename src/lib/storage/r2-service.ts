// Cloudflare R2 via the official S3-compatible SDK (@aws-sdk/client-s3).
// Server only: holds credentials and a live client.
//
// This is the multi-bucket successor to the hand-rolled signer in ./r2.ts,
// which serves the single-bucket admin upload path (R2_BUCKET). New code
// should use this service with a bucket purpose from ./r2-buckets.ts.
//
// Required env (same account-level names ./r2.ts uses):
//   R2_ACCOUNT_ID           Cloudflare account id
//   R2_ACCESS_KEY_ID        R2 API token access key
//   R2_SECRET_ACCESS_KEY    R2 API token secret
//   R2_PUBLIC_BASE_URL      public CDN base for the public bucket (product-images)
//
// Bucket names are code constants; see infra/cloudflare/r2-setup.md.

import 'server-only'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  type R2BucketPurpose,
  R2_BUCKETS,
  assertValidR2Key,
  isPublicR2Bucket,
  r2BucketName,
} from './r2-buckets'

const DEFAULT_UPLOAD_URL_TTL_SECONDS = 600
const DEFAULT_DOWNLOAD_URL_TTL_SECONDS = 3600

export function isR2StorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY,
  )
}

// Memoised per credential set, so tests that stub different env values do not
// get a client built from a previous stub.
let cached: { key: string; client: S3Client } | null = null

export function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 is not configured: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY')
  }

  const cacheKey = `${accountId}:${accessKeyId}:${secretAccessKey}`
  if (cached?.key !== cacheKey) {
    cached = {
      key: cacheKey,
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        // SPELLED OUT AT THE SDK'S OWN DEFAULT, which is 3 and `standard`
        // (exponential backoff with full jitter, retrying throttling and
        // transient 5xx only). Nothing changes by writing it here.
        //
        // It is written because the absence read as a gap: an audit looking
        // for "exponential backoff on R2" finds no retry code in this
        // repository and concludes there is none, when in fact every
        // PutObject already gets three jittered attempts from the SDK. The
        // alternative to this comment is re-deriving that from the AWS SDK
        // source every time somebody asks.
        //
        // Three is also the right number here rather than a placeholder: an
        // R2 write on the image path is called from a request a person is
        // waiting on, and the durable retries in this system are the ones
        // that belong on a queue (see invoices.ts and the QStash search
        // pipeline), not in a held-open HTTP handler.
        maxAttempts: 3,
        retryMode: 'standard',
      }),
    }
  }
  return cached.client
}

function checkedKey(purpose: R2BucketPurpose, key: string, contentType?: string): void {
  assertValidR2Key(key)
  if (contentType && !R2_BUCKETS[purpose].allowedTypes.includes(contentType)) {
    throw new Error(`content type ${contentType} is not allowed in bucket ${r2BucketName(purpose)}`)
  }
}

/** Public CDN URL for an object in the public bucket. Throws for private buckets. */
export function r2ObjectPublicUrl(purpose: R2BucketPurpose, key: string): string {
  if (!isPublicR2Bucket(purpose)) {
    throw new Error(`bucket ${r2BucketName(purpose)} is private; use createR2SignedDownloadUrl`)
  }
  assertValidR2Key(key)
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  if (!base) throw new Error('R2_PUBLIC_BASE_URL is not set')
  return `${base}/${key}`
}

/**
 * Server-side upload, for bytes the server already holds (generated QR codes,
 * synced product images). Browser uploads should use createR2SignedUploadUrl
 * instead so the bytes never pass through the Next.js server.
 */
export async function uploadToR2(
  purpose: R2BucketPurpose,
  key: string,
  body: Uint8Array | Buffer | string,
  contentType: string,
): Promise<{ key: string; publicUrl: string | null }> {
  checkedKey(purpose, key, contentType)
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: r2BucketName(purpose),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return {
    key,
    publicUrl: isPublicR2Bucket(purpose) ? r2ObjectPublicUrl(purpose, key) : null,
  }
}

export async function deleteFromR2(purpose: R2BucketPurpose, key: string): Promise<void> {
  assertValidR2Key(key)
  await getR2Client().send(new DeleteObjectCommand({ Bucket: r2BucketName(purpose), Key: key }))
}

/**
 * Presigned PUT URL for a direct browser upload. Content-Type is part of the
 * signature, so the browser must send exactly the type it declared here.
 */
export async function createR2SignedUploadUrl(
  purpose: R2BucketPurpose,
  key: string,
  contentType: string,
  expiresSeconds = DEFAULT_UPLOAD_URL_TTL_SECONDS,
): Promise<{ uploadUrl: string; key: string; publicUrl: string | null }> {
  checkedKey(purpose, key, contentType)
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: r2BucketName(purpose),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresSeconds },
  )
  return {
    uploadUrl,
    key,
    publicUrl: isPublicR2Bucket(purpose) ? r2ObjectPublicUrl(purpose, key) : null,
  }
}

/**
 * Presigned GET URL for reading an object from a private bucket
 * (coupon-qrcodes, user-uploads). Public-bucket objects should use
 * r2ObjectPublicUrl and the CDN instead.
 */
export async function createR2SignedDownloadUrl(
  purpose: R2BucketPurpose,
  key: string,
  expiresSeconds = DEFAULT_DOWNLOAD_URL_TTL_SECONDS,
): Promise<string> {
  assertValidR2Key(key)
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: r2BucketName(purpose), Key: key }),
    { expiresIn: expiresSeconds },
  )
}
