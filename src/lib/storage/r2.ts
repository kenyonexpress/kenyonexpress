// Cloudflare R2, single-bucket admin path, on the official S3-compatible SDK
// (@aws-sdk/client-s3). Server only: holds credentials and a live client.
//
// Two ways in:
//   - putR2Object / uploadImageVariants: the server already holds the bytes
//     (admin image pipeline, invoice PDF mirror) and writes them directly.
//   - createR2PresignedPutUrl: the browser PUTs the file straight to R2, so the
//     bytes never pass through the Next.js server.
// When R2 env vars are absent, callers fall back to Supabase Storage.
//
// Required env:
//   R2_ACCOUNT_ID           Cloudflare account id (subdomain of r2 endpoint)
//   R2_ACCESS_KEY_ID        R2 API token access key
//   R2_SECRET_ACCESS_KEY    R2 API token secret
//   R2_BUCKET_NAME          target bucket name (R2_BUCKET is the older name,
//                           still read so production keeps working while both
//                           are set; R2_BUCKET_NAME wins)
//   R2_PUBLIC_BASE_URL      public CDN base, e.g. https://cdn.kenyonexpress.co.il

import 'server-only'

import { type ProcessedImage, processImage } from '@/lib/images/process'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { assertValidR2Key } from './r2-buckets'

/** Content-addressed keys (uuid per upload) never change, so cache forever. */
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export function r2BucketFromEnv(): string {
  return process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || ''
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      r2BucketFromEnv() &&
      process.env.R2_PUBLIC_BASE_URL,
  )
}

export function r2PublicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  return `${base}/${key}`
}

// Memoised per credential set, so tests that stub different env values do not
// get a client built from a previous stub. Retries are the SDK default (3,
// standard backoff); see r2-service.ts for why that is the right number here.
let cached: { key: string; client: S3Client } | null = null

export function getR2SingleBucketClient(): S3Client {
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
        maxAttempts: 3,
        retryMode: 'standard',
      }),
    }
  }
  return cached.client
}

function requireBucket(): string {
  const bucket = r2BucketFromEnv()
  if (!bucket) throw new Error('R2 is not configured: R2_BUCKET_NAME')
  return bucket
}

/** Server-side write of bytes the server already holds. Returns the public URL. */
export async function putR2Object(
  key: string,
  body: Uint8Array | Buffer | string,
  contentType: string,
  cacheControl: string = IMMUTABLE_CACHE_CONTROL,
): Promise<string> {
  assertValidR2Key(key)
  await getR2SingleBucketClient().send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  )
  return r2PublicUrl(key)
}

/**
 * Build a presigned PUT URL valid for `expiresSeconds`. The browser must PUT the
 * raw file body to this URL. Content-Type is deliberately left out of the
 * command, so only `host` is signed and the client may set its own type.
 */
export async function createR2PresignedPutUrl(
  key: string,
  expiresSeconds = 600,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  assertValidR2Key(key)
  const uploadUrl = await getSignedUrl(
    getR2SingleBucketClient(),
    new PutObjectCommand({ Bucket: requireBucket(), Key: key }),
    { expiresIn: expiresSeconds },
  )
  return { uploadUrl, publicUrl: r2PublicUrl(key) }
}

export type R2ImageVariant = {
  format: 'webp' | 'avif'
  width: number
  height: number
  key: string
  url: string
  bytes: number
}

export type R2ImageUpload = {
  width: number
  height: number
  blurDataURL: string
  /** Largest webp first, then the smaller webp tiers, then the avif. */
  variants: R2ImageVariant[]
}

/**
 * Decode one original, emit the AVIF + WebP renditions (lib/images/process),
 * and write every one under `${basePath}/w{width}.{format}`.
 *
 * `processed` lets a caller that already ran processImage (to gate dimensions
 * before spending uploads) pass the result instead of decoding twice.
 */
export async function uploadImageVariants(
  basePath: string,
  original: Buffer,
  processed?: ProcessedImage,
): Promise<R2ImageUpload> {
  assertValidR2Key(basePath)
  const image = processed ?? (await processImage(original))
  const variants: R2ImageVariant[] = []
  for (const rendition of image.renditions) {
    const key = `${basePath}/w${rendition.width}.${rendition.format}`
    const url = await putR2Object(key, rendition.buffer, `image/${rendition.format}`)
    variants.push({
      format: rendition.format,
      width: rendition.width,
      height: rendition.height,
      key,
      url,
      bytes: rendition.buffer.length,
    })
  }
  return {
    width: image.width,
    height: image.height,
    blurDataURL: image.blurDataURL,
    variants,
  }
}
